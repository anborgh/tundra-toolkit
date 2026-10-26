(function (global) {
  'use strict';

  const awaitTimeout = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

  const myHeaders = new Headers();
  myHeaders.append('Content-Type', 'text/plain; charset=windows-1251');

  const transformWindows1251ToUTF8 = (response) => {
    const transformedBody = response.body
      .pipeThrough(new TextDecoderStream('windows-1251'))
      .pipeThrough(new TextEncoderStream());
    return new Response(transformedBody);
  };

  const fetchHtmlDoc = async (url) => {
    const page = await fetch(url, { headers: myHeaders });
    const resp = transformWindows1251ToUTF8(page);
    const html = await resp.text();
    return new DOMParser().parseFromString(html, 'text/html');
  };

  const emptyResult = () => ({
    total: 0,
    profiles: {},
    topics: {},
    errors: 0,
    posts: {},
  });

  /**
   * Retry wrapper preserving legacy semantics: fatal when errors > maxErrors.
   */
  const withRetry = async (fn, { result, maxErrors = 10, onRetry, delayMs = 10000 }) => {
    while (true) {
      try {
        return await fn();
      } catch (error) {
        if (result.errors > maxErrors) {
          const fatal = new Error('post stats scrape failed');
          fatal.cause = error;
          fatal.fatal = true;
          throw fatal;
        }
        if (typeof onRetry === 'function') onRetry(maxErrors - result.errors);
        await awaitTimeout(delayMs);
        result.errors += 1;
      }
    }
  };

  const collectForumTopics = async ({ baseUrl, forumIds, result, onProgress, onRetry }) => {
    const topicLinks = {};

    for (let i = 0; i < forumIds.length; i++) {
      const forumId = forumIds[i];
      if (isNaN(forumId)) continue;

      await withRetry(async () => {
        onProgress?.(i + 1, forumIds.length, 'Собираю темы в форумах');
        const doc = await fetchHtmlDoc(`${baseUrl}/viewforum.php?id=${forumId}&p=-1`);
        const title = doc.querySelector('.main h1').textContent;
        const links = [];
        doc.querySelectorAll('.forum tbody tr').forEach((row) => {
          if (row.classList.contains('isticky')) return;
          const isNew = row.classList.contains('inew');
          const link = isNew
            ? row.querySelector('.tclcon > strong a:first-of-type')
            : row.querySelector('.tclcon > a:first-of-type');
          const href = link.getAttribute('href');
          links.push(href);
        });
        topicLinks[forumId] = { title, links };
      }, { result, onRetry });

      await awaitTimeout(200);
    }

    return topicLinks;
  };

  const countPostsInTopics = async ({
    baseUrl,
    topicLinks,
    userIds,
    startDate,
    endDate,
    countChars,
    result,
    onProgress,
    onRetry,
  }) => {
    const forumIds = Object.keys(topicLinks);
    const totalTopics = forumIds.reduce((total, forumId) => total + topicLinks[forumId].links.length, 0);
    let processedTopics = 0;
    const userIdSet = new Set(userIds.map(Number));

    for (let forumIndex = 0; forumIndex < forumIds.length; forumIndex++) {
      const forumId = forumIds[forumIndex];
      const forumTitle = topicLinks[forumId].title;
      const topics = topicLinks[forumId].links;
      let stopForum = false;

      for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
        onProgress?.(
          processedTopics + 1,
          totalTopics,
          `Считаю посты в форуме ${forumTitle}`
        );
        if (stopForum) break;

        let outcome = 'counted';
        await withRetry(async () => {
          outcome = 'counted';
          const url = topics[topicIndex];
          const doc = await fetchHtmlDoc(`${url}&p=-1`);
          const posts = /** @type {NodeListOf<HTMLElement>} */ (doc.querySelectorAll('.post'));
          const title = doc.querySelector('.main h1').textContent;

          const lastPost = posts[posts.length - 1];
          const lastPostDate = new Date(Number(lastPost.dataset.posted) * 1000);
          if (lastPostDate < startDate) {
            stopForum = true;
            outcome = 'stop';
            return;
          }

          const firstPost = posts[0];
          const firstPostDate = new Date(Number(firstPost.dataset.posted) * 1000);
          if (firstPostDate > endDate) {
            outcome = 'skip';
            return;
          }

          for (let postIndex = posts.length - 1; postIndex >= 0; postIndex--) {
            const post = posts[postIndex];
            if (post.classList.contains('topicpost')) break;

            const postDate = new Date(Number(post.dataset.posted) * 1000);
            if (postDate < startDate) break;
            if (postDate > endDate) continue;

            const postUserId = Number(post.dataset.userId);
            if (!postUserId || !userIdSet.has(postUserId)) continue;
            const userKey = String(postUserId);

            result.total += 1;
            result.profiles[userKey] = (result.profiles[userKey] || 0) + 1;

            if (countChars) {
              if (!result.posts[userKey]) result.posts[userKey] = {};
              const postId = post.id.replace('p', '');
              const postUrl = `${baseUrl}/viewtopic.php?pid=${postId}#p${postId}`;
              const postContent = post.querySelector('.post-content');
              if (postContent) {
                const postSig = postContent.querySelector('.post-sig');
                if (postSig) postSig.remove();
                const count = Math.floor(postContent.textContent.length / 1000);
                const bucket = `${count}k`;
                result.posts[userKey][bucket] = result.posts[userKey][bucket] || [];
                result.posts[userKey][bucket].push(postUrl);
              }
            }

            if (!result.topics[url]) {
              result.topics[url] = { count: 0, title };
            }
            result.topics[url].count += 1;
            await awaitTimeout(0);
          }

          outcome = 'counted';
        }, { result, onRetry });

        if (outcome === 'stop' || stopForum) {
          // Формально учитываем текущую и все оставшиеся темы форума,
          // отброшенные досрочным прерыванием по дате последнего поста.
          processedTopics += topics.length - topicIndex;
          onProgress?.(
            processedTopics,
            totalTopics,
            `Считаю посты в форуме ${forumTitle}`
          );
          break;
        }
        if (outcome === 'skip') continue;

        processedTopics += 1;
        await awaitTimeout(200);
      }
    }
  };

  /**
   * Scrape forum pages for post stats in date range.
   * @returns {{ result: object }}
   */
  const scrapePostStats = async ({
    baseUrl,
    forumIds,
    userIds,
    startDate,
    endDate,
    countChars,
    onProgress,
    onRetry,
  }) => {
    const result = emptyResult();
    const topicLinks = await collectForumTopics({
      baseUrl,
      forumIds,
      result,
      onProgress,
      onRetry,
    });
    await countPostsInTopics({
      baseUrl,
      topicLinks,
      userIds,
      startDate,
      endDate,
      countChars,
      result,
      onProgress,
      onRetry,
    });
    return { result };
  };

  global.__TT_POST_STATS_SCRAPE__ = scrapePostStats;
})(typeof globalThis !== 'undefined' ? globalThis : window);

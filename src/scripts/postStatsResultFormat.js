(function (global) {
  'use strict';

  const padCount = (count) => ('  ' + count).slice(-3);

  /** Scrape result -> neutral report model (no HTML/BBCode). */
  const buildReportModel = (result, { fromLabel, toLabel, countChars }) => {
    const profiles = result.profiles || {};
    const topicsMap = result.topics || {};
    const postsMap = result.posts || {};

    const users = Object.keys(profiles)
      .sort((a, b) => profiles[a] - profiles[b])
      .map((userId) => ({ userId, count: profiles[userId] }));

    const topics = Object.keys(topicsMap)
      .sort((a, b) => topicsMap[b].count - topicsMap[a].count)
      .map((url) => ({
        url,
        title: topicsMap[url].title,
        count: topicsMap[url].count,
      }));

    let charStats = null;
    if (countChars) {
      charStats = Object.keys(postsMap).map((userId) => ({
        userId,
        buckets: Object.entries(postsMap[userId])
          .sort(([a], [b]) => Number.parseInt(b, 10) - Number.parseInt(a, 10))
          .map(([key, urls]) => ({ key, urls })),
      }));
    }

    return {
      fromLabel,
      toLabel,
      episodeCount: topics.length,
      postTotal: result.total,
      users,
      topics,
      charStats,
    };
  };

  const reportToCharsHtml = (report, { getUserLabelHtml }) => {
    const parts = [
      `С ${report.fromLabel} по ${report.toLabel} написали:<br><br>`,
      `Эпизодов: ${report.episodeCount}<br>`,
      `Постов: ${report.postTotal}<br><br>`,
    ];

    report.users.forEach(({ userId, count }) => {
      parts.push(`${getUserLabelHtml(userId)}: ${count}<br>`);
    });
    parts.push('<br>');
    return parts.join('');
  };

  const reportToTopicsHtml = (report, { getUserLabelHtml, escapeHtml }) => {
    const parts = [];

    report.topics.forEach(({ url, title, count }) => {
      parts.push(
        `${padCount(count)}| <a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a><br>`
      );
    });

    if (report.charStats) {
      parts.push('<br><hr>', '<h4>По символам</h4>');
      report.charStats.forEach(({ userId, buckets }) => {
        parts.push(`${getUserLabelHtml(userId)}:<br>`);
        buckets.forEach(({ key, urls }) => {
          parts.push(`${key}: ${urls.length}<br>`);
          urls.forEach((url) => {
            parts.push(`  <a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a><br>`);
          });
        });
        parts.push('<br>');
      });
    }

    return parts.join('');
  };

  const reportToBbcode = (report, { getUserLabelBbcode }) => {
    const lines = [
      `С ${report.fromLabel} по ${report.toLabel} написали:`,
      '',
      `Эпизодов: ${report.episodeCount}`,
      `Постов: ${report.postTotal}`,
      '',
    ];

    report.users.forEach(({ userId, count }) => {
      lines.push(`${getUserLabelBbcode(userId)}: ${count}`);
    });
    lines.push('');

    report.topics.forEach(({ url, title, count }) => {
      lines.push(`${padCount(count)}| [url=${url}]${title}[/url]`);
    });

    if (report.charStats) {
      lines.push('', 'По символам');
      report.charStats.forEach(({ userId, buckets }) => {
        lines.push(`${getUserLabelBbcode(userId)}:`);
        buckets.forEach(({ key, urls }) => {
          lines.push(`${key}: ${urls.length}`);
          // Post URLs stay plain text in BBCode — only profile links become [url].
          urls.forEach((url) => lines.push(`  ${url}`));
        });
        lines.push('');
      });
    }

    return lines.join('\n').replace(/\n+$/, '');
  };

  /**
   * Pure result formatter: scrape data -> model -> HTML + BBCode.
   */
  const formatPostStatsResult = ({
    result,
    fromLabel,
    toLabel,
    countChars,
    getUserLabelHtml,
    getUserLabelBbcode,
    escapeHtml,
  }) => {
    const report = buildReportModel(result, { fromLabel, toLabel, countChars });
    return {
      charsHtml: reportToCharsHtml(report, { getUserLabelHtml }),
      topicsHtml: reportToTopicsHtml(report, { getUserLabelHtml, escapeHtml }),
      bbcodeText: reportToBbcode(report, { getUserLabelBbcode }),
    };
  };

  global.__TT_POST_STATS_FORMAT_RESULT__ = formatPostStatsResult;
})(typeof globalThis !== 'undefined' ? globalThis : window);

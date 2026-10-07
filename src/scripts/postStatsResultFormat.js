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
    const rows = [ ...report.users ]
      .sort((a, b) => b.count - a.count)
      .map(({ userId, count }) => `<tr><td>${getUserLabelHtml(userId)}</td><td class="num">${count}</td></tr>`)
      .join('');

    return [
      `<p class="ttPeriod">С ${report.fromLabel} по ${report.toLabel}</p>`,
      '<div class="ttStats">',
      `<div class="ttStat"><span>Эпизодов</span><strong>${report.episodeCount}</strong></div>`,
      `<div class="ttStat"><span>Постов</span><strong>${report.postTotal}</strong></div>`,
      '</div>',
      rows
        ? `<div class="ttTableWrap"><table class="ttTable"><thead><tr><th>Профиль</th><th class="num">Постов</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '',
    ].join('');
  };

  const reportToTopicsHtml = (report, { getUserLabelHtml, escapeHtml }) => {
    const parts = [];

    if (report.topics.length) {
      parts.push('<h4>Эпизоды</h4><ol class="ttTopics">');
      report.topics.forEach(({ url, title, count }) => {
        parts.push(
          `<li><span class="count">${count}</span><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></li>`
        );
      });
      parts.push('</ol>');
    }

    if (report.charStats) {
      parts.push('<h4 style="margin-top:16px">По символам</h4><div class="ttChars">');
      report.charStats.forEach(({ userId, buckets }) => {
        parts.push(`<strong>${getUserLabelHtml(userId)}</strong><br>`);
        buckets.forEach(({ key, urls }) => {
          parts.push(`${key}: ${urls.length}<br>`);
          urls.forEach((url) => {
            parts.push(`&nbsp;&nbsp;<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a><br>`);
          });
        });
        parts.push('<br>');
      });
      parts.push('</div>');
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

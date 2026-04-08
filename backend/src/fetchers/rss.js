const Parser = require('rss-parser');
const logger = require('../utils/logger');

class RSSFetcher {
  constructor() {
    this.parser = new Parser({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
  }

  async fetch(url, sourceName) {
    let timer = null;

    try {
      const controller = new AbortController();
      timer = setTimeout(function () { controller.abort(); }, 6000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Status code ${resp.status}`);
      }

      const xml = await resp.text();
      const feed = await this.parser.parseString(xml);
      
      return feed.items.map(item => ({
        title: item.title,
        url: item.link,
        summary: item.contentSnippet || item.summary || '',
        date: item.pubDate || item.isoDate,
        source: sourceName
      }));
    } catch (err) {
      // Don't log full stack for common network errors to keep logs clean
      logger.error({ 
        url, 
        sourceName, 
        err: err.message || err 
      }, 'RSS fetch failed');
      return [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

module.exports = new RSSFetcher();

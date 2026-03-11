import {
  buildAvailableRanges,
  mergeSiteCalendarPages,
  parseSiteCalendarPage,
  resolveNextSiteCalendarUrl,
} from '../src/site-calendar';

describe('site calendar parsing', () => {
  test('parses a site details page with mixed statuses and navigation', () => {
    const html = `
      <div id="sitenamearea">
        <div class="siteTile"><span class="label">Site, Loop:</span>BH13, BIRCH</div>
      </div>
      <a id="nextWeek" href="/camping/bear-lake-state-park/r/campsiteDetails.do?arvdate=06/05/2026&amp;contractCode=UT&amp;parkId=343061&amp;siteId=6780">Next 2 weeks ></a>
      <input type="hidden" value="03/10/2027" name="dateMaxWindow" id="dateMaxWindow">
      <input type="hidden" value="6780" name="siteId" id="siteId">
      <div id="calendar" class="items">
        <div class="thead">
          <div class="th calendar"><div class="date">22</div><div class="weekday notranslate">F</div></div>
          <div class="th calendar"><div class="date">23</div><div class="weekday notranslate">Sa</div></div>
          <div class="th calendar"><div class="date">24</div><div class="weekday notranslate">Su</div></div>
          <div class="th calendar"><div class="date">25</div><div class="weekday notranslate">M</div></div>
        </div>
        <div class="br">
          <div class="td status a notranslate" data-auto-id="mday20260522"><a>A</a></div>
          <div class="td status r notranslate" data-auto-id="mday20260523"><a>R</a></div>
          <div class="td status w notranslate" data-auto-id="mday20260524"><a>W</a></div>
          <div class="td status x notranslate" data-auto-id="mday20260525"><a>X</a></div>
        </div>
      </div>
    `;

    const parsed = parseSiteCalendarPage(html, 'https://example.com/campsiteDetails.do?siteId=6780');

    expect(parsed.site).toBe('BH13');
    expect(parsed.loop).toBe('BIRCH');
    expect(parsed.siteId).toBe('6780');
    expect(parsed.maxReservationWindowDate).toBe('03/10/2027');
    expect(parsed.nextPagePath).toBe('/camping/bear-lake-state-park/r/campsiteDetails.do?arvdate=06/05/2026&contractCode=UT&parkId=343061&siteId=6780');
    expect(parsed.days).toEqual([
      { date: '05/22/2026', status: 'A', reservable: true },
      { date: '05/23/2026', status: 'R', reservable: false },
      { date: '05/24/2026', status: 'W', reservable: false },
      { date: '05/25/2026', status: 'X', reservable: false },
    ]);
  });

  test('merges overlapping 2-week pages by date', () => {
    const pageOne = parseSiteCalendarPage(`
      <div id="sitenamearea"><div class="siteTile">Site, Loop: BH13, BIRCH</div></div>
      <input type="hidden" value="6780" id="siteId">
      <div id="calendar" class="items"><div class="br">
        <div class="td status a" data-auto-id="mday20260522"><a>A</a></div>
        <div class="td status a" data-auto-id="mday20260523"><a>A</a></div>
      </div></div>
    `, 'https://example.com/a');
    const pageTwo = parseSiteCalendarPage(`
      <div id="sitenamearea"><div class="siteTile">Site, Loop: BH13, BIRCH</div></div>
      <input type="hidden" value="6780" id="siteId">
      <div id="calendar" class="items"><div class="br">
        <div class="td status a" data-auto-id="mday20260523"><a>A</a></div>
        <div class="td status r" data-auto-id="mday20260524"><a>R</a></div>
      </div></div>
    `, 'https://example.com/b');

    expect(mergeSiteCalendarPages([pageOne, pageTwo])).toEqual([
      { date: '05/22/2026', status: 'A', reservable: true },
      { date: '05/23/2026', status: 'A', reservable: true },
      { date: '05/24/2026', status: 'R', reservable: false },
    ]);
  });

  test('builds contiguous available ranges and excludes walk-up days', () => {
    const ranges = buildAvailableRanges([
      { date: '05/22/2026', status: 'A', reservable: true },
      { date: '05/23/2026', status: 'A', reservable: true },
      { date: '05/24/2026', status: 'W', reservable: false },
      { date: '05/25/2026', status: 'A', reservable: true },
      { date: '05/26/2026', status: 'A', reservable: true },
      { date: '05/27/2026', status: 'A', reservable: true },
      { date: '05/28/2026', status: 'R', reservable: false },
    ]);

    expect(ranges).toEqual([
      { startDate: '05/22/2026', endDate: '05/23/2026', nights: 2 },
      { startDate: '05/25/2026', endDate: '05/27/2026', nights: 3 },
    ]);
  });

  test('synthesizes the next 2-week seed when the page hides the nextWeek link', () => {
    const page = parseSiteCalendarPage(`
      <div id="sitenamearea"><div class="siteTile">Site, Loop: BH13, BIRCH</div></div>
      <input type="hidden" value="6780" id="siteId">
      <input type="hidden" value="03/10/2027" id="dateMaxWindow">
      <div id="calendar" class="items"><div class="br">
        <div class="td status r" data-auto-id="mday20260715"><a>R</a></div>
        <div class="td status r" data-auto-id="mday20260716"><a>R</a></div>
        <div class="td status r" data-auto-id="mday20260728"><a>R</a></div>
      </div></div>
    `, 'https://example.com/b');

    const nextUrl = resolveNextSiteCalendarUrl(
      page,
      mergeSiteCalendarPages([page]),
      'https://example.com/b',
      '6780',
      '1',
      '07/31/2026',
    );

    expect(nextUrl).toContain('siteId=6780');
    expect(nextUrl).toContain('arvdate=07%2F29%2F2026');
    expect(nextUrl).toContain('lengthOfStay=1');
  });
});

import { parseSearchResult } from '../src/reserveamerica';

describe('ReserveAmerica Parser', () => {
  const targetDate = '07/22/2026';

  const mockHtmlAvailable = `
    <div id="calendar" class="items">
      <div class="thead">
        <div class="th calendar">Wed Jul 22</div>
        <div class="th calendar">Thu Jul 23</div>
      </div>
      <div class="br">
        <div class="siteListLabel"><a href="#">BH01</a></div>
        <div class="td loopName">BIRCH</div>
        <div class="td status A">A</div>
        <div class="td status X">X</div>
      </div>
      <div class="br">
        <div class="siteListLabel"><a href="#">BH02</a></div>
        <div class="td loopName">BIRCH</div>
        <div class="td status A">A</div>
        <div class="td status A">A</div>
      </div>
    </div>
  `;

  const mockHtmlUnavailable = `
    <div id="calendar" class="items">
      <div class="thead">
        <div class="th calendar">Wed Jul 22</div>
      </div>
      <div class="br">
        <div class="siteListLabel"><a href="#">BH01</a></div>
        <div class="td loopName">BIRCH</div>
        <div class="td status R">R</div>
      </div>
    </div>
  `;

  test('should identify available sites for exact date', () => {
    const result = parseSearchResult(mockHtmlAvailable, targetDate);
    
    expect(result.totalSites).toBe(2);
    expect(result.availableSites.length).toBe(2);
    expect(result.exactDateMatches.length).toBe(2);
    expect(result.exactDateMatches[0].site).toBe('BH01');
    expect(result.exactDateMatches[1].site).toBe('BH02');
  });

  test('should filter out unavailable sites', () => {
    const result = parseSearchResult(mockHtmlUnavailable, targetDate);
    
    expect(result.totalSites).toBe(1);
    expect(result.availableSites.length).toBe(0);
    expect(result.exactDateMatches.length).toBe(0);
  });

  test('should correctly identify nearby availability', () => {
    const mockHtmlNearby = `
      <div id="calendar" class="items">
        <div class="thead">
          <div class="th calendar">Wed Jul 22</div>
          <div class="th calendar">Thu Jul 23</div>
        </div>
        <div class="br">
          <div class="siteListLabel"><a href="#">BH03</a></div>
          <div class="td loopName">BIRCH</div>
          <div class="td status R">R</div>
          <div class="td status A">A</div>
        </div>
      </div>
    `;
    const result = parseSearchResult(mockHtmlNearby, targetDate);
    
    expect(result.exactDateMatches.length).toBe(0);
    expect(result.availableSites.length).toBe(1);
    expect(result.availableSites[0].site).toBe('BH03');
    expect(result.availableSites[0].availableDates).toContain('07/23/2026');
  });

  test('should throw error if calendar is missing', () => {
    const badHtml = '<div>No calendar here</div>';
    expect(() => parseSearchResult(badHtml, targetDate)).toThrow('Calendar section was not found');
  });
});

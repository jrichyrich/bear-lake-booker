import { assignPreferredSitesToAgents } from '../src/site-targeting';

describe('site targeting', () => {
  test('cycles all preferred sites across agents when there are fewer sites than agents', () => {
    const assignments = assignPreferredSitesToAgents(
      ['BH09', 'BH11', 'BH45'],
      [
        { accountKey: 'lisa', localAgentIndex: 1 },
        { accountKey: 'jason', localAgentIndex: 1 },
        { accountKey: 'lisa', localAgentIndex: 2 },
        { accountKey: 'jason', localAgentIndex: 2 },
        { accountKey: 'lisa', localAgentIndex: 3 },
        { accountKey: 'jason', localAgentIndex: 3 },
      ],
    );

    expect(assignments).toEqual([
      'BH09',
      'BH11',
      'BH45',
      'BH09',
      'BH11',
      'BH45',
    ]);
  });
});

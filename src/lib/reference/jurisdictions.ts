/**
 * The fifty states and the District of Columbia, as payroll sees them.
 *
 * What is in here and what is deliberately not in here matters, so it is worth
 * being plain about it.
 *
 * In here: the postal code, the name, whether workers compensation is bought
 * from a state monopoly fund, whether that fund quotes its premium per hour
 * worked rather than per hundred dollars of payroll, and the agency that
 * publishes prevailing wage determinations where that agency is well known.
 * Those are facts about the state. They do not change from year to year and
 * they do not change from one contractor to the next.
 *
 * Not in here: any tax rate. The state unemployment rate is assigned to each
 * employer individually and reissued every year, so a rate shipped in the
 * software would be wrong for most companies on the day it shipped and wrong
 * for all of them a year later. Every jurisdiction is seeded with no rate and
 * unverified, and the wage sheet says so on its face until somebody enters the
 * rate from their own annual notice and records that they checked it. That is
 * exactly what the source form asks for: it shall be verified by the contractor
 * at the start of the project.
 *
 * `wageAuthority` is left null where the publishing body is not something to
 * assert from memory. Null shows as "not recorded" with an invitation to fill
 * it in, which is honest; a plausible but wrong agency name is not.
 */

export interface JurisdictionSeed {
  code: string
  name: string
  /** Workers compensation is sold by a state monopoly fund, not the market. */
  stateFund?: boolean
  /** The fund quotes premium per hour worked rather than per 100 of payroll. */
  perHourWorkersComp?: boolean
  wageAuthority?: string
  notes?: string
}

export const JURISDICTIONS: readonly JurisdictionSeed[] = [
  { code: 'AL', name: 'Alabama' },
  {
    code: 'AK',
    name: 'Alaska',
    wageAuthority: 'Alaska Department of Labor and Workforce Development',
  },
  { code: 'AZ', name: 'Arizona', wageAuthority: 'Industrial Commission of Arizona' },
  { code: 'AR', name: 'Arkansas' },
  {
    code: 'CA',
    name: 'California',
    wageAuthority: 'California Department of Industrial Relations',
  },
  {
    code: 'CO',
    name: 'Colorado',
    wageAuthority: 'Colorado Department of Labor and Employment',
  },
  { code: 'CT', name: 'Connecticut', wageAuthority: 'Connecticut Department of Labor' },
  { code: 'DE', name: 'Delaware', wageAuthority: 'Delaware Department of Labor' },
  {
    code: 'DC',
    name: 'District of Columbia',
    wageAuthority: 'DC Department of Employment Services',
  },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  {
    code: 'HI',
    name: 'Hawaii',
    wageAuthority: 'Hawaii Department of Labor and Industrial Relations',
  },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois', wageAuthority: 'Illinois Department of Labor' },
  { code: 'IN', name: 'Indiana', wageAuthority: 'Indiana Department of Labor' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky', wageAuthority: 'Kentucky Labor Cabinet' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine', wageAuthority: 'Maine Department of Labor' },
  { code: 'MD', name: 'Maryland', wageAuthority: 'Maryland Department of Labor' },
  {
    code: 'MA',
    name: 'Massachusetts',
    wageAuthority: 'Massachusetts Department of Labor Standards',
  },
  {
    code: 'MI',
    name: 'Michigan',
    wageAuthority: 'Michigan Department of Labor and Economic Opportunity',
  },
  {
    code: 'MN',
    name: 'Minnesota',
    wageAuthority: 'Minnesota Department of Labor and Industry',
  },
  { code: 'MS', name: 'Mississippi' },
  {
    code: 'MO',
    name: 'Missouri',
    wageAuthority: 'Missouri Department of Labor and Industrial Relations',
  },
  {
    code: 'MT',
    name: 'Montana',
    wageAuthority: 'Montana Department of Labor and Industry',
  },
  { code: 'NE', name: 'Nebraska', wageAuthority: 'Nebraska Department of Labor' },
  { code: 'NV', name: 'Nevada', wageAuthority: 'Nevada Office of the Labor Commissioner' },
  { code: 'NH', name: 'New Hampshire' },
  {
    code: 'NJ',
    name: 'New Jersey',
    wageAuthority: 'New Jersey Department of Labor and Workforce Development',
  },
  {
    code: 'NM',
    name: 'New Mexico',
    wageAuthority: 'New Mexico Department of Workforce Solutions',
  },
  { code: 'NY', name: 'New York', wageAuthority: 'New York State Department of Labor' },
  { code: 'NC', name: 'North Carolina' },
  {
    code: 'ND',
    name: 'North Dakota',
    stateFund: true,
    notes: 'Workers compensation is bought from Workforce Safety and Insurance, the state fund.',
  },
  { code: 'OH', name: 'Ohio', stateFund: true, wageAuthority: 'Ohio Department of Commerce' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon', wageAuthority: 'Oregon Bureau of Labor and Industries' },
  {
    code: 'PA',
    name: 'Pennsylvania',
    wageAuthority: 'Pennsylvania Department of Labor and Industry',
  },
  {
    code: 'RI',
    name: 'Rhode Island',
    wageAuthority: 'Rhode Island Department of Labor and Training',
  },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  {
    code: 'TN',
    name: 'Tennessee',
    wageAuthority: 'Tennessee Department of Labor and Workforce Development',
  },
  {
    code: 'TX',
    name: 'Texas',
    notes:
      'Prevailing wage on state and local work is set by the awarding public body rather than by a single state schedule, so record which body issued the rates on each sheet.',
  },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont', wageAuthority: 'Vermont Department of Labor' },
  { code: 'VA', name: 'Virginia', wageAuthority: 'Virginia Department of Labor and Industry' },
  {
    code: 'WA',
    name: 'Washington',
    stateFund: true,
    perHourWorkersComp: true,
    wageAuthority: 'Washington State Department of Labor and Industries',
    notes:
      'Workers compensation is bought from Labor and Industries and is quoted in cents per hour worked by risk classification, so item 7 on the wage sheet takes the published rate directly with no conversion.',
  },
  { code: 'WV', name: 'West Virginia', wageAuthority: 'West Virginia Division of Labor' },
  {
    code: 'WI',
    name: 'Wisconsin',
    wageAuthority: 'Wisconsin Department of Workforce Development',
  },
  {
    code: 'WY',
    name: 'Wyoming',
    stateFund: true,
    notes: 'Workers compensation is bought from the state fund administered by the Department of Workforce Services.',
  },
]

/**
 * Counties, for the states this company builds in.
 *
 * Prevailing wage is determined county by county, federally and in the states
 * that publish their own schedules, so the county is what identifies which
 * schedule a sheet was built from. Both lists below are complete: Washington
 * has thirty-nine counties and Colorado has sixty-four, and every one is here.
 *
 * The other forty-eight jurisdictions ship with no counties rather than with a
 * list recalled from memory. Counties are added on the jurisdiction page as
 * work reaches a new state, which takes a minute and is right, where an
 * approximate list of three thousand would be neither.
 */
export const COUNTIES: Readonly<Record<string, readonly string[]>> = {
  WA: [
    'Adams',
    'Asotin',
    'Benton',
    'Chelan',
    'Clallam',
    'Clark',
    'Columbia',
    'Cowlitz',
    'Douglas',
    'Ferry',
    'Franklin',
    'Garfield',
    'Grant',
    'Grays Harbor',
    'Island',
    'Jefferson',
    'King',
    'Kitsap',
    'Kittitas',
    'Klickitat',
    'Lewis',
    'Lincoln',
    'Mason',
    'Okanogan',
    'Pacific',
    'Pend Oreille',
    'Pierce',
    'San Juan',
    'Skagit',
    'Skamania',
    'Snohomish',
    'Spokane',
    'Stevens',
    'Thurston',
    'Wahkiakum',
    'Walla Walla',
    'Whatcom',
    'Whitman',
    'Yakima',
  ],
  CO: [
    'Adams',
    'Alamosa',
    'Arapahoe',
    'Archuleta',
    'Baca',
    'Bent',
    'Boulder',
    'Broomfield',
    'Chaffee',
    'Cheyenne',
    'Clear Creek',
    'Conejos',
    'Costilla',
    'Crowley',
    'Custer',
    'Delta',
    'Denver',
    'Dolores',
    'Douglas',
    'Eagle',
    'El Paso',
    'Elbert',
    'Fremont',
    'Garfield',
    'Gilpin',
    'Grand',
    'Gunnison',
    'Hinsdale',
    'Huerfano',
    'Jackson',
    'Jefferson',
    'Kiowa',
    'Kit Carson',
    'La Plata',
    'Lake',
    'Larimer',
    'Las Animas',
    'Lincoln',
    'Logan',
    'Mesa',
    'Mineral',
    'Moffat',
    'Montezuma',
    'Montrose',
    'Morgan',
    'Otero',
    'Ouray',
    'Park',
    'Phillips',
    'Pitkin',
    'Prowers',
    'Pueblo',
    'Rio Blanco',
    'Rio Grande',
    'Routt',
    'Saguache',
    'San Juan',
    'San Miguel',
    'Sedgwick',
    'Summit',
    'Teller',
    'Washington',
    'Weld',
    'Yuma',
  ],
}

/** States whose county list ships complete, for the page to say which. */
export const COUNTIES_SEEDED = Object.keys(COUNTIES)

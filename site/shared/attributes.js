// Port of src/attributes.py — the counterfactual attribute injection used by the audit and
// by the live demo. Kept behaviourally identical to the Python original.

export const GENDER_PAIRS = [
  ['Emily', 'Greg', 'Walsh'],
  ['Sarah', 'Matthew', 'Olson'],
  ['Lakisha', 'Jamal', 'Washington'],
  ['Aisha', 'Darnell', 'Jefferson'],
  ['Maria', 'Jose', 'Hernandez'],
  ['Lucia', 'Carlos', 'Garcia'],
  ['Mei', 'Wei', 'Chen'],
  ['Priya', 'Rajesh', 'Patel'],
  ['Anne', 'Brad', 'Becker'],
  ['Yuki', 'Hiroshi', 'Tanaka'],
];

export const GENDERS = ['Female', 'Male'];
export const PRONOUNS = { Female: ['She', 'her'], Male: ['He', 'his'] };

export const LOCATIONS = {
  US: [
    'Austin, TX, USA', 'Chicago, IL, USA', 'Seattle, WA, USA',
    'Atlanta, GA, USA', 'Boston, MA, USA', 'Denver, CO, USA',
  ],
  'UK/Europe': [
    'London, UK', 'Berlin, Germany', 'Manchester, UK',
    'Paris, France', 'Amsterdam, Netherlands', 'Madrid, Spain',
  ],
  Asia: [
    'Kuala Lumpur, Malaysia', 'Bangalore, India', 'Singapore',
    'Manila, Philippines', 'Shanghai, China', 'Ho Chi Minh City, Vietnam',
  ],
};
export const REGIONS = Object.keys(LOCATIONS);

const LOCATION_PLACEHOLDER = /\bCity\s*,\s*State\b/g;

const COUNTRY_PATTERNS = {
  US: /\b(USA|U\.S\.A?\.?|United States)\b/,
  India: /\bIndia\b/,
  UK: /\b(United Kingdom|UK|England|London)\b/,
  Canada: /\bCanada\b/,
  Malaysia: /\bMalaysia\b/,
  Philippines: /\bPhilippines\b/,
  China: /\bChina\b/,
  Germany: /\bGermany\b/,
  Nigeria: /\bNigeria\b/,
};

export const EDU_LEVELS = ['None', 'High school', 'Associate', 'Bachelor', 'Master', 'PhD'];

const EDU_PATTERNS = [
  [5, /\b(Ph\.?\s?D|Doctor of Philosophy|Doctorate|Ed\.D)\b/i],
  [4, /\b(Master'?s?\b|Master of|M\.\s?[AS]\b|MBA|M\.?Sc|M\.Ed|M\.Tech)/i],
  [3, /\b(Bachelor'?s?\b|Bachelor of|B\.\s?[AS]\b|B\.?Sc|B\.Tech|B\.E\.|B\.Com|BBA|BS in|BA in)/],
  [2, /\b(Associate'?s? (of|in|degree)|Associates? Degree|A\.A\.S?\.|A\.S\. degree)/i],
  [1, /\b(High School Diploma|GED|Diploma)\b/i],
];

const JD_EDU_PATTERNS = [
  [5, /\b(Ph\.?\s?D|Doctorate|Doctoral degree)\b/],
  [4, /\b(Master'?s'? degree|Masters degree|Master of|MBA|M\.S\.|M\.A\.|graduate degree)/i],
  [3, /\b(Bachelor'?s?|Bachelor of|B\.S\.|B\.A\.|four[- ]year degree|4[- ]year degree|undergraduate degree)/i],
  [2, /\b(Associate'?s? degree|Associates? degree|two[- ]year degree|2[- ]year degree)/i],
];

const PREFERRED = /\b(prefer\w*|plus|nice to have|a bonus|desired|ideally|may be)\b/i;
const EQUIVALENT = /\bor (equivalent|comparable|related) (work |professional )?experience\b|\bor \d+\+? years/i;

const split = (values, part) => (part === 'fit' ? values.filter((_, i) => i % 2 === 0) : values.filter((_, i) => i % 2 === 1));

export const genderNames = (part = 'audit') => split(GENDER_PAIRS, part);
export const locations = (region, part = 'audit') => split(LOCATIONS[region], part);

function educationSection(text) {
  const m = /\bEducation( and Training| & Training)?\b/.exec(text);
  return m ? text.slice(m.index) : text;
}

export function educationLevel(text) {
  const section = educationSection(text);
  for (const [level, pat] of EDU_PATTERNS) if (pat.test(section)) return level;
  return 0;
}

export function requiredEducation(jdText) {
  const required = [];
  for (const sentence of jdText.split(/(?<=[.;\n•])\s+/)) {
    if (PREFERRED.test(sentence) || EQUIVALENT.test(sentence)) continue;
    const levels = JD_EDU_PATTERNS.filter(([, pat]) => pat.test(sentence)).map(([lvl]) => lvl);
    if (levels.length) required.push(Math.min(...levels));
  }
  return required.length ? Math.min(...required) : 0;
}

export function countriesMentioned(text) {
  return Object.keys(COUNTRY_PATTERNS).filter((c) => COUNTRY_PATTERNS[c].test(text));
}

/** Name/pronoun header + location filled into every "City, State" placeholder. */
export function withIdentity(text, { first, last, gender, location } = {}) {
  const header = [];
  if (first) {
    header.push(`${first} ${last}`);
    header.push(`${first.toLowerCase()}.${last.toLowerCase()}@email.com`);
  }
  if (location) {
    header.push(location);
    text = text.replace(LOCATION_PLACEHOLDER, location);
  }
  if (gender) {
    const [subj, poss] = PRONOUNS[gender];
    header.push(`${subj} brings ${poss} experience to this role.`);
  }
  return header.length ? `${header.join('\n')}\n\n${text}` : text;
}

/**
 * The 6 counterfactual twins used by the Streamlit app: 3 regions x 2 genders using the
 * first audit name pair and the first audit city of each region.
 */
export function twinSpecs(cvText) {
  const [female, male, last] = genderNames('audit')[0];
  const twins = [{ location: null, gender: null, text: cvText }];
  for (const region of REGIONS) {
    const city = locations(region, 'audit')[0];
    for (const [gender, first] of [[GENDERS[0], female], [GENDERS[1], male]]) {
      twins.push({
        location: region,
        gender,
        text: withIdentity(cvText, { first, last, gender, location: city }),
      });
    }
  }
  return twins;
}

/** Counterfactual variants used by the dataset-wide audit (one attribute at a time). */
export function auditVariants(cvText, index = 0) {
  const pairs = genderNames('audit');
  const [female, male, last] = pairs[index % pairs.length];
  const out = [];
  for (const [gender, first] of [[GENDERS[0], female], [GENDERS[1], male]]) {
    out.push({ attr: 'gender', group: gender, text: withIdentity(cvText, { first, last, gender }) });
  }
  for (const region of REGIONS) {
    const city = locations(region, 'audit')[index % 3];
    out.push({ attr: 'location', group: region, text: withIdentity(cvText, { location: city }) });
  }
  return out;
}

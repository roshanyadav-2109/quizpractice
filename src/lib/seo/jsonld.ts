import { SITE, SOCIALS, ORIGIN, absolute } from './site'

/**
 * Structured data, as schema.org JSON-LD.
 *
 * Mostly for identity rather than rich results: it tells Google, Bing and
 * the assistants built on them what this site is (an independent practice
 * site by Unknown IITians, not IIT Madras), what each page is (a subject's
 * papers, one paper, one question), and how the pages relate. Every entity
 * has a stable @id so the pieces on different pages join into one graph.
 */

type Json = Record<string, unknown>

export const IDS = {
  organization: `${ORIGIN}/#organization`,
  publisher: `${SITE.publisherUrl}/#organization`,
  website: `${ORIGIN}/#website`,
  iitm: 'https://www.iitm.ac.in/#organization',
}

/** The profiles Unknown IITians runs, so assistants connect the brand across them. */
const PUBLISHER_PROFILES = [SITE.publisherUrl, ...SOCIALS.map((social) => social.url)]

/** Who runs the site and who publishes it. On every page. */
export function siteGraph(): Json {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': IDS.organization,
        name: SITE.name,
        alternateName: SITE.alternateNames,
        url: ORIGIN,
        logo: { '@type': 'ImageObject', url: absolute('/icon.png'), width: 192, height: 192 },
        description: SITE.description,
        parentOrganization: { '@id': IDS.publisher },
        knowsAbout: [
          'IIT Madras BS degree',
          'IITM BS previous year question papers',
          'IITM BS Qualifier exam',
          'IITM BS Quiz 1',
          'IITM BS Quiz 2',
          'IITM BS End Term exam',
          'BS in Data Science and Applications',
          'BS in Electronic Systems',
        ],
      },
      {
        '@type': 'Organization',
        '@id': IDS.publisher,
        name: SITE.publisher,
        url: SITE.publisherUrl,
        sameAs: PUBLISHER_PROFILES,
      },
      {
        '@type': 'WebSite',
        '@id': IDS.website,
        name: SITE.name,
        alternateName: SITE.alternateNames,
        url: ORIGIN,
        description: SITE.description,
        inLanguage: SITE.language,
        publisher: { '@id': IDS.organization },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}

export interface Crumb {
  name: string
  path: string
}

export function breadcrumbList(crumbs: Crumb[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  }
}

/** A hub: the page, the list it holds, and where it sits. */
export function collectionPage({
  path,
  name,
  description,
  crumbs,
  items,
  about,
  modified,
}: {
  path: string
  name: string
  description: string
  crumbs: Crumb[]
  items: { name: string; path: string }[]
  about?: Json
  modified?: string | null
}): Json {
  const url = absolute(path)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name,
        description,
        inLanguage: SITE.language,
        isPartOf: { '@id': IDS.website },
        publisher: { '@id': IDS.organization },
        ...(about ? { about } : {}),
        ...(modified ? { dateModified: modified } : {}),
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: { '@id': `${url}#list` },
      },
      { ...breadcrumbList(crumbs), '@id': `${url}#breadcrumb` },
      {
        '@type': 'ItemList',
        '@id': `${url}#list`,
        numberOfItems: items.length,
        itemListElement: items.slice(0, 200).map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          url: absolute(item.path),
        })),
      },
    ],
  }
}

/**
 * The IIT Madras course a subject's papers belong to. The course is IIT
 * Madras's, so IIT Madras is its provider; this site only hosts its old papers.
 */
export function courseEntity({
  name,
  code,
  program,
  level,
  url,
}: {
  name: string
  code: string | null
  program: string
  level: string
  url: string
}): Json {
  return {
    '@type': 'Course',
    name,
    ...(code ? { courseCode: code } : {}),
    description: `${name} — a ${level} course of the IIT Madras ${program} programme.`,
    educationalLevel: level,
    provider: {
      '@type': 'CollegeOrUniversity',
      '@id': IDS.iitm,
      name: 'Indian Institute of Technology Madras',
      alternateName: ['IIT Madras', 'IITM'],
      url: 'https://study.iitm.ac.in/',
    },
    url,
  }
}

export interface QuizQuestion {
  name: string
  text: string
  /** The correct answers in words: the right options, or the value. Empty when the key has none. */
  answers: string[]
  /** Every option in words, right and wrong. */
  options: string[]
  url: string
  kind: 'Multiple choice' | 'Multiple select' | 'Numerical' | 'Written'
}

/** One question, with its accepted answer where the paper has one. */
export function questionEntity(question: QuizQuestion): Json {
  const wrong = question.options.filter((option) => !question.answers.includes(option))
  const accepted = question.answers.map((text) => ({ '@type': 'Answer', text }))
  return {
    '@type': 'Question',
    name: question.name,
    text: question.text,
    url: question.url,
    eduQuestionType: question.kind,
    ...(wrong.length > 0 ? { suggestedAnswer: wrong.map((text) => ({ '@type': 'Answer', text })) } : {}),
    ...(accepted.length > 0 ? { acceptedAnswer: accepted.length === 1 ? accepted[0] : accepted } : {}),
  }
}

/** A paper: a learning resource and the quiz it is, with its questions. */
export function paperEntity({
  path,
  name,
  description,
  crumbs,
  course,
  questions,
  timeRequiredMinutes,
  dateCreated,
  modified,
  educationalLevel,
  totalQuestions,
  lockedSelector,
}: {
  path: string
  name: string
  description: string
  crumbs: Crumb[]
  course: Json
  /** The questions the page shows — its free preview. */
  questions: QuizQuestion[]
  timeRequiredMinutes: number | null
  dateCreated: string | null
  modified: string | null
  educationalLevel: string
  /** How many questions the paper has, preview or not. */
  totalQuestions: number
  /**
   * The part of the page that stands for what needs a sign-in. Google's
   * markup for content behind a login or paywall: the page is not free to
   * access in full, and this element is where it stops.
   */
  lockedSelector?: string
}): Json {
  const url = absolute(path)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Quiz', 'LearningResource'],
        '@id': `${url}#quiz`,
        url,
        name,
        description,
        inLanguage: SITE.language,
        learningResourceType: 'Previous year question paper',
        educationalLevel,
        isAccessibleForFree: !lockedSelector,
        ...(timeRequiredMinutes ? { timeRequired: `PT${timeRequiredMinutes}M` } : {}),
        ...(dateCreated ? { dateCreated } : {}),
        ...(modified ? { dateModified: modified } : {}),
        about: course,
        isPartOf: { '@id': IDS.website },
        publisher: { '@id': IDS.organization },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        numberOfQuestions: totalQuestions,
        hasPart: [
          ...questions.slice(0, 80).map(questionEntity),
          ...(lockedSelector ? [{ '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: lockedSelector }] : []),
        ],
      },
      { ...breadcrumbList(crumbs), '@id': `${url}#breadcrumb` },
    ],
  }
}

/** A plain page (about, a guide). */
export function webPage({ path, name, description, crumbs, type = 'WebPage' }: { path: string; name: string; description: string; crumbs: Crumb[]; type?: string }): Json {
  const url = absolute(path)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': type,
        '@id': `${url}#page`,
        url,
        name,
        description,
        inLanguage: SITE.language,
        isPartOf: { '@id': IDS.website },
        publisher: { '@id': IDS.organization },
        ...(crumbs.length > 1 ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
      },
      // A trail of one — the home page — is no trail.
      ...(crumbs.length > 1 ? [{ ...breadcrumbList(crumbs), '@id': `${url}#breadcrumb` }] : []),
    ],
  }
}

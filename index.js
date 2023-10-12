const { Octokit } = require('@octokit/rest')
const yaml = require('js-yaml')
const fs = require('fs')

const fresh = false

const starsFile = "./stars.json"
const outDir = 'out'
const cacheDir = 'cache'

const client = new Octokit({
  auth: process.env.TOKEN
})

async function writeStars() {
  /** @type Array<import('@octokit/openapi-types/types').components['schemas']['repository']> */
  let result = []
  let page = 0
  const per_page = 100
  while (true) {
    console.log(`Loading page ${page}`)
    const list = await client.rest.activity.listReposStarredByAuthenticatedUser({ per_page, page, headers: { accept: 'application/vnd.github.star+json' } })
    result = result.concat(list.data.map(({ starred_at, repo }) => ({ ...repo, starred_at })))

    if (list.data.length < per_page) {
      break
    }

    page++
  }
  fs.writeFileSync(starsFile, JSON.stringify(result), 'utf-8');
  return result
}

async function loadStars() {
  /** @type Array<import('@octokit/openapi-types/types').components['schemas']['repository']> */
  let result
  if (!fresh && fs.existsSync(starsFile)) {
    const data = fs.readFileSync(starsFile, 'utf-8')
    try {
      result = JSON.parse(data)
    } catch {
      console.log("Error loading cached stars, reloading")
    }
  } else {
    console.log("Cached stars not found or required fresh load")
  }
  if (!result) {
    result = await writeStars()
  }
  return result
}

/**
 * 
 * @param {import('@octokit/openapi-types/types').components['schemas']['repository']} repo 
 * @returns {Promise<string>}
 */

async function loadReadme(repo) {
  const file = `${cacheDir}/${repo.name}.md`
  /** @type {import('@octokit/openapi-types/types').components['schemas']['content-file']} */
  let content
  if (!fresh && fs.existsSync(file)) {
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch { }
  }
  if (!content) {
    try {
      const readme = await client.rest.repos.getReadme({ repo: repo.name, owner: repo.owner.login, headers: { accept: 'application/vnd.github.raw+json' } })
      content = readme.data
      fs.writeFileSync(file, content, 'utf-8')
    } catch (e) {
      content = '*empty*'
      fs.writeFileSync(file, content, 'utf-8')
    }
  }

  return content
}

/**
 * 
 * @param {import('@octokit/openapi-types/types').components['schemas']['repository']} repo 
 * @returns string
 */
function setHeaders(repo) {
  const { starred_at, created_at, updated_at, pushed_at, id, name, description, archived, full_name, language, html_url, homepage, watchers_count, stargazers_count, forks_count } = repo
  return '---\n' + yaml.dump({
    tags: ['github'],
    id,
    starred_at,
    name,
    homepage,
    description,
    archived,
    full_name,
    language,
    html_url,
    watchers_count,
    forks_count,
    stargazers_count,
    created_at,
    license: [repo.license?.key, repo.license?.name].filter(Boolean),
    topics: repo.topics,
  }) + '\n---\n'
}

/**
 * 
 * @param {import('@octokit/openapi-types/types').components['schemas']['repository']} repo 
 * @returns undefined
 */
async function loadRepo(repo) {
  const name = repo.name
  console.log(`Downloading ${name}`)
  const headers = setHeaders(repo)
  let content = await loadReadme(repo)
  fs.writeFileSync(`${outDir}/${name}.md`, `${headers}\n\n${content}`, 'utf-8')
}

async function main() {
  const stars = await loadStars()
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir)
  }
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir)
  }
  for (const repo of stars) {
    await loadRepo(repo)
  }
}

main()

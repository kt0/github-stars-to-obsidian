const {Octokit} = require('@octokit/rest')
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
    const list = await client.rest.activity.listReposStarredByAuthenticatedUser({ per_page, page })
    const shit = list.data[0]
    result = result.concat(list.data)

    if (list.data.length < per_page) {
      break
    }

    page ++
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
  const file = `${cacheDir}/${repo.name}.json`
  /** @type {import('@octokit/openapi-types/types').components['schemas']['content-file']} */
  let content
  if (!fresh && fs.existsSync(file)) {
    try {
      content = JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch {}
  }
  if (!content) {
    try {
      const readme = await client.rest.repos.getReadme({ repo: repo.name, owner: repo.owner.login })
      content = readme.data
      fs.writeFileSync(file, JSON.stringify(content), 'utf-8')
    } catch (e) {
      content = { content: '' }
      fs.writeFileSync(file, JSON.stringify({content: ''}), 'utf-8')
    }
  }
  
  let result = content.content
  if (content.encoding === 'base64') {
    result = atob(result)
  }
  return result
}

/**
 * 
 * @param {import('@octokit/openapi-types/types').components['schemas']['repository']} repo 
 * @returns string
 */
function setHeaders(repo) {
  return `---
tags:
  - github
id: ${repo.id}
name: ${repo.name}
archived: ${repo.archived}
full_name: ${repo.full_name}
description: ${repo.description}
language: ${repo.language}
html_url: ${repo.html_url}
homepage: ${repo.homepage}
watchers_count: ${repo.watchers_count}
forks_count: ${repo.forks_count}
stargazers_count: ${repo.stargazers_count}
created_at: ${repo.created_at}
updated_at: ${repo.updated_at}
pushed_at: ${repo.pushed_at}
license_key: ${repo.license?.key}
license_name: ${repo.license?.name}
topics: ${repo.topics.length > 0 ? "\n" + repo.topics.map(t => `  - ${t}`).join('\n') : '[]'}
---`
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

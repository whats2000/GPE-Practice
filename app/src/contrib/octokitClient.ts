import { Octokit } from 'octokit'

export interface ContribTarget {
  owner: string
  repo: string
}

export interface CommitFile {
  path: string
  content: string
  encoding?: 'utf-8' | 'base64'
}

export interface ProposeArgs {
  pat: string
  target: ContribTarget
  branchPrefix: string
  files: CommitFile[]
  commitMessage: string
  prTitle: string
  prBody: string
  labels?: string[]
}

export interface ProposeResult {
  prUrl: string
  branch: string
  commitSha: string
}

export function detectTarget(): ContribTarget {
  if (typeof window !== 'undefined') {
    const m = window.location.href.match(/https?:\/\/([^.]+)\.github\.io\/([^/]+)/)
    if (m) return { owner: m[1], repo: m[2] }
  }
  return { owner: 'whats2000', repo: 'GPE-Practice' }
}

export function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function openPr(args: ProposeArgs): Promise<ProposeResult> {
  const octokit = new Octokit({ auth: args.pat })

  await octokit.request('GET /user')

  const forkRes = await octokit.request('POST /repos/{owner}/{repo}/forks', {
    owner: args.target.owner,
    repo: args.target.repo,
  })
  const forkOwner = forkRes.data.owner.login as string
  const forkRepo = forkRes.data.name as string

  const upstreamRepo = await octokit.request('GET /repos/{owner}/{repo}', {
    owner: args.target.owner,
    repo: args.target.repo,
  })
  const defaultBranch = upstreamRepo.data.default_branch
  const upstreamRef = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
    owner: args.target.owner,
    repo: args.target.repo,
    branch: defaultBranch,
  })
  const baseSha = upstreamRef.data.object.sha

  const branchName = `${args.branchPrefix}/${Date.now()}`
  await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner: forkOwner,
    repo: forkRepo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  })

  let lastCommitSha = baseSha
  for (const file of args.files) {
    const encoded =
      file.encoding === 'base64' ? file.content : encodeBase64Utf8(file.content)
    const res = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: forkOwner,
      repo: forkRepo,
      path: file.path,
      message: args.commitMessage,
      content: encoded,
      branch: branchName,
    })
    if (res.data.commit?.sha) lastCommitSha = res.data.commit.sha
  }

  const prRes = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner: args.target.owner,
    repo: args.target.repo,
    title: args.prTitle,
    body: args.prBody,
    head: `${forkOwner}:${branchName}`,
    base: defaultBranch,
  })

  if (args.labels && args.labels.length > 0) {
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
      owner: args.target.owner,
      repo: args.target.repo,
      issue_number: prRes.data.number,
      labels: args.labels,
    })
  }

  return {
    prUrl: prRes.data.html_url,
    branch: branchName,
    commitSha: lastCommitSha,
  }
}

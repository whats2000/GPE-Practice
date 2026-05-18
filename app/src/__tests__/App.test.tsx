import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../App'

describe('App', () => {
  it('renders the app name in the header', () => {
    render(<App />)
    expect(screen.getByText('GPE 練習')).toBeInTheDocument()
  })

  it('renders the question list as the default route', () => {
    render(<App />)
    expect(screen.getByText('題目列表')).toBeInTheDocument()
  })

  it('shows the footer note about local-first data', () => {
    render(<App />)
    expect(screen.getByText(/所有測資與題目皆透過 PR 貢獻/)).toBeInTheDocument()
  })
})

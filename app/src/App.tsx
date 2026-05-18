import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import QuestionList from './routes/QuestionList'
import QuestionView from './routes/QuestionView'
import Settings from './routes/Settings'
import NotFound from './routes/NotFound'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<QuestionList />} />
          <Route path="/q/:id" element={<QuestionView />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhHant from './zh-Hant.json'

void i18n.use(initReactI18next).init({
  resources: { 'zh-Hant': { translation: zhHant } },
  lng: 'zh-Hant',
  fallbackLng: 'zh-Hant',
  interpolation: { escapeValue: false },
})

export default i18n

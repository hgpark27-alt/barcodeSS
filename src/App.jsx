import ScannerApp from './ScannerApp'
import PCApp from './PCApp'

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

export default function App() {
  return isMobile ? <ScannerApp /> : <PCApp />
}

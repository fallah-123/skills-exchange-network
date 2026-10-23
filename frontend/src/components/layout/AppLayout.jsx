// Wraps authenticated and public pages in the global header and main landmark.
import Navbar from './Navbar.jsx';
import './AppLayout.css';

/** Provides the shared application header, skip link, and main content region. */
export default function AppLayout({ children }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar />
      <main id="main-content">{children}</main>
    </>
  );
}

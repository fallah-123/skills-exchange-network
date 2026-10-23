// Updates the browser tab title for the active route.
import { useEffect } from 'react';

const PRODUCT_NAME = 'Skills Exchange Network';

/** Sets the document title while a page is mounted. */
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [title]);
}

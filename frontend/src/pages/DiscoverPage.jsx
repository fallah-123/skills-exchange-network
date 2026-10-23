// Discovers developers with debounced name search and URL-backed pagination.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listDevelopers } from '../api/developers.api.js';
import DeveloperCard from '../components/domain/DeveloperCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { DEFAULT_PAGE_SIZE, SEARCH_DEBOUNCE_MS, SEARCH_MAX } from '../constants.js';
import useApi from '../hooks/useApi.js';
import useDebouncedValue from '../hooks/useDebouncedValue.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import './DiscoverPage.css';

/** Renders searchable developer results and keeps search/page in the URL. */
export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';
  const parsedPage = Number(searchParams.get('page') || 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [search, setSearch] = useState(searchParam);
  const immediateSearch = useRef(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const normalizedSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);
  const request = useApi((signal) => listDevelopers({ search: normalizedSearch, page, limit: DEFAULT_PAGE_SIZE }, signal), [normalizedSearch, page]);
  useDocumentTitle('Discover Developers');

  useEffect(() => {
    setSearch(searchParam);
    if (immediateSearch.current !== searchParam) immediateSearch.current = null;
  }, [searchParam]);
  useEffect(() => {
    if (searchParams.get('page') === String(page)) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [page, searchParams, setSearchParams]);
  useEffect(() => {
    if (immediateSearch.current === searchParam) {
      if (debouncedSearch === searchParam) immediateSearch.current = null;
      return;
    }
    if (debouncedSearch === searchParam) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch.trim()) next.set('search', debouncedSearch.trim());
    else next.delete('search');
    next.delete('page');
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, searchParam, searchParams, setSearchParams]);

  function applySearch(event) {
    event.preventDefault();
    const normalizedSearchValue = search.trim();
    const next = new URLSearchParams(searchParams);
    if (normalizedSearchValue) next.set('search', normalizedSearchValue);
    else next.delete('search');
    next.delete('page');
    immediateSearch.current = normalizedSearchValue;
    setSearch(normalizedSearchValue);
    setSearchParams(next);
  }
  function changePage(nextPage) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  }
  const developers = request.data || [];
  const totalPages = Math.max(1, Math.ceil((request.meta?.total || 0) / (request.meta?.limit || DEFAULT_PAGE_SIZE)));
  return (
    <div className="page-shell discover-page">
      <h1>Discover Developers</h1>
      <form className="discover-page__search" role="search" onSubmit={applySearch}>
        <label htmlFor="developer-search">Search by name</label>
        <div>
          <input id="developer-search" type="search" maxLength={SEARCH_MAX} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search developers" />
          <button type="submit">Search</button>
        </div>
      </form>
      {request.isLoading ? <LoadingBlock label="Finding developers" /> : null}
      {request.error ? <ErrorState message={request.error.message} onRetry={request.reload} /> : null}
      {!request.isLoading && !request.error && developers.length === 0 ? (
        <EmptyState title={request.meta?.total === 0 && !normalizedSearch ? 'No other developers have joined yet.' : `No developers match "${searchParam}".`} />
      ) : null}
      {!request.isLoading && !request.error && developers.length ? (
        <>
          <div className="discover-page__grid">{developers.map((developer) => <DeveloperCard key={developer.id} developer={developer} />)}</div>
          <Pagination page={page} totalPages={totalPages} onPageChange={changePage} />
        </>
      ) : null}
    </div>
  );
}

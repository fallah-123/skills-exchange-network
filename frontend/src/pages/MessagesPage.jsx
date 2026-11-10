import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import useConversationInbox from '../hooks/useConversationInbox.js';
import useConversation from '../hooks/useConversation.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import Button from '../components/ui/Button.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import MessageComposer from '../components/domain/MessageComposer.jsx';
import { MAX_ENTITY_ID } from '../constants.js';
import { pollingLabel } from '../utils/polling.js';
import './MessagesPage.css';

const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Avatar({ name }) {
  return <span className="message-avatar" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('')}</span>;
}

function Conversation({ id, userId, onSent }) {
  const chat = useConversation(id, userId, onSent);
  const viewport = useRef(null);
  const anchor = useRef(null);
  const stickToBottom = useRef(true);
  const lastMessageId = useRef(null);
  const previousScrollTop = useRef(0);
  const automaticOlderCursor = useRef(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const latestId = chat.messages.at(-1)?.id;
    if (lastMessageId.current && latestId !== lastMessageId.current && !stickToBottom.current) setHasNewMessages(true);
    lastMessageId.current = latestId;
    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (stickToBottom.current) {
      node.scrollTop = node.scrollHeight;
      setHasNewMessages(false);
    }
  }, [chat.messages]);

  async function older() {
    await chat.loadOlder(() => {
      const node = viewport.current;
      if (node) anchor.current = { top: node.scrollTop, height: node.scrollHeight };
    });
  }

  function historyScrolled() {
    const node = viewport.current;
    const movingUp = node.scrollTop < previousScrollTop.current;
    previousScrollTop.current = node.scrollTop;
    stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (stickToBottom.current) setHasNewMessages(false);
    // Fetch one earlier page when the reader approaches the top. Do not retry
    // the same failed cursor on every scroll event; the visible button retries it.
    if (movingUp && node.scrollTop <= 80 && chat.before && !chat.working && automaticOlderCursor.current !== chat.before) {
      automaticOlderCursor.current = chat.before;
      older();
    }
  }

  if (chat.loading) return <div className="chat-placeholder"><LoadingBlock label="Loading conversation" /><p role="status">{pollingLabel(chat.pollStatus)}</p></div>;
  if (chat.error) return <div className="chat-placeholder"><Link to="/messages">← All conversations</Link><ErrorState message={chat.error.message} onRetry={chat.reload} /></div>;
  const counterpart = chat.conversation.counterpart;
  return <section className="chat" aria-label={`Conversation with ${counterpart.displayName}`}>
    <header className="chat__header">
      <Link className="chat__back" to="/messages" aria-label="Back to conversations">←</Link>
      <Avatar name={counterpart.displayName} />
      <div className="chat__identity"><h2><Link to={`/developers/${counterpart.id}`}>{counterpart.displayName}</Link></h2><span>Connected developer</span></div>
      <Button variant="secondary" onClick={chat.refresh} disabled={!!chat.working}>{chat.working === 'refresh' ? 'Refreshing…' : 'Refresh messages'}</Button>
    </header>
    {chat.before && <div className="chat__history-controls">
      <span>Earlier messages are available. Scroll up to load them.</span>
      <Button variant="secondary" onClick={older} disabled={!!chat.working}>{chat.working === 'older' ? 'Loading…' : 'Load older messages'}</Button>
    </div>}
    {chat.actionError && <div className="message-error chat__error" role="alert">{chat.actionError.message} Use Load older messages to retry.</div>}
    <div className="chat__history" ref={viewport} tabIndex={0} aria-label="Message history" onScroll={historyScrolled}>
      {!chat.before && chat.messages.length > 0 && <p className="chat__history-start">Beginning of conversation</p>}
      {!chat.messages.length && <div className="chat__empty"><span className="message-symbol" aria-hidden="true">↗</span><h3>Start a conversation</h3><p>Say hello to {counterpart.displayName} and discuss what you’d like to learn together.</p></div>}
      <ol className="chat__messages" aria-label="Conversation messages">
        {chat.messages.map((message, index) => {
          const own = message.senderId === userId;
          const date = new Date(message.createdAt);
          const day = dayFormat.format(date);
          const showDay = index === 0 || dayFormat.format(new Date(chat.messages[index - 1].createdAt)) !== day;
          return <li key={message.id}>
            {showDay && <div className="chat__day">{day}</div>}
            <article className={`chat__message${own ? ' chat__message--own' : ''}`} aria-label={`Message from ${own ? 'you' : counterpart.displayName}`}>
              <p>{message.body}</p>
              <footer><span>{own ? 'You · Sent' : counterpart.displayName}</span><time dateTime={message.createdAt} title={fullFormat.format(date)}>{timeFormat.format(date)}</time></footer>
            </article>
          </li>;
        })}
      </ol>
    </div>
    {hasNewMessages && <div className="chat__new-messages"><Button variant="secondary" onClick={() => {
      stickToBottom.current = true;
      viewport.current.scrollTop = viewport.current.scrollHeight;
      setHasNewMessages(false);
    }}>New messages ↓</Button></div>}
    <div className="chat__refresh-note" role="status">{pollingLabel(chat.pollStatus)}</div>
    <MessageComposer onSend={(fields) => { stickToBottom.current = true; return chat.send(fields); }} />
  </section>;
}

export default function MessagesPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawPage = params.get('page');
  const page = /^\d+$/.test(rawPage || '') && Number(rawPage) >= 1 && Number(rawPage) <= 10000 ? Number(rawPage) : 1;
  const inbox = useConversationInbox(page, user.id);
  const validId = id && /^[1-9]\d*$/.test(id) && Number(id) <= MAX_ENTITY_ID;
  useDocumentTitle('Messages');

  return <div className="page-shell messages-page">
    <div className="messages-page__heading"><div><h1>Messages</h1><p>Good conversations build great collaborations.</p></div><Link to="/requests?status=accepted">Your connections ↗</Link></div>
    <div className={`messaging-workspace${id ? ' messaging-workspace--selected' : ''}`}>
      <aside className="conversation-list" aria-label="Conversations">
        <header><h2>Conversations</h2><Button variant="secondary" onClick={() => page === 1 ? inbox.reload() : setParams({})} disabled={inbox.isLoading} aria-label="Refresh conversations">Refresh</Button></header>
        {!['live', 'connecting'].includes(inbox.status.phase) && <p className="conversation-list__status" role="status">{pollingLabel(inbox.status)}</p>}
        {inbox.isLoading && <LoadingBlock label="Loading conversations" />}
        {inbox.error && !inbox.data && <ErrorState message={inbox.error.message} onRetry={inbox.reload} />}
        {inbox.data && <>
          {!inbox.data?.length && <div className="conversation-list__empty"><h3>{page > 1 ? 'No more conversations' : 'Your conversations start here'}</h3><p>Open an accepted connection and choose Message.</p><Link to="/requests?status=accepted">View connections</Link></div>}
          <ul>{inbox.data?.map((conversation) => <li key={conversation.id}>
            <Link to={`/messages/${conversation.id}${page > 1 ? `?page=${page}` : ''}`} className="conversation-list__item" aria-current={String(conversation.id) === id ? 'page' : undefined}>
              <Avatar name={conversation.counterpart.displayName} />
              <span className="conversation-list__summary"><strong>{conversation.counterpart.displayName}</strong><span>{conversation.lastMessage ? `${conversation.lastMessage.senderId === user.id ? 'You: ' : ''}${conversation.lastMessage.body}` : 'Say hello and start collaborating'}</span></span>
              <time dateTime={conversation.lastMessage?.createdAt || conversation.createdAt}>{dayFormat.format(new Date(conversation.lastMessage?.createdAt || conversation.createdAt))}</time>
            </Link>
          </li>)}</ul>
          {(page > 1 || inbox.meta?.hasMore) && <nav className="conversation-list__pages" aria-label="Conversation pages"><Button variant="secondary" disabled={page === 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={!inbox.meta?.hasMore} onClick={() => setParams({ page: String(page + 1) })}>Next</Button></nav>}
        </>}
      </aside>
      {validId ? <Conversation key={`${user.id}:${id}`} id={Number(id)} userId={user.id} onSent={inbox.reload} /> : <section className="chat-placeholder">
        <span className="message-symbol" aria-hidden="true">↗</span><h2>{id ? 'Conversation not found' : 'A space to connect'}</h2>
        <p>{id ? 'Choose an available conversation to continue.' : 'Choose a conversation, or message a connected developer to exchange ideas and plan your next session.'}</p>
        <Link to={id ? '/messages' : '/requests?status=accepted'}>{id ? 'All conversations' : 'Find a connection'}</Link>
      </section>}
    </div>
  </div>;
}

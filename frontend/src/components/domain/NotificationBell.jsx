import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext.jsx';
import Icon from '../ui/Icon.jsx';
import { notificationPath, notificationText, relativeNotificationTime } from '../../utils/notifications.js';
import './NotificationBell.css';

export default function NotificationBell() {
  const notifications = useNotifications();
  const container = useRef(null);
  const button = useRef(null);
  const closeButton = useRef(null);
  const actionsMenu = useRef(null);
  const menuButton = useRef(null);
  const clearDialog = useRef(null);
  const { open, setOpen, unreadCount, items, loaded, error, actionError, busy } = notifications;
  useEffect(() => {
    if (!notifications.confirmClearAllOpen || !open) return;
    const dialog = clearDialog.current;
    dialog.showModal();
    return () => { dialog.close(); menuButton.current?.focus(); };
  }, [notifications.confirmClearAllOpen, open]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    function key(event) {
      if (clearDialog.current?.open) return; // Native dialog owns Escape and focus.
      if (event.key === 'Escape' && actionsMenu.current?.open) {
        actionsMenu.current.open = false; menuButton.current?.focus(); return;
      }
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    }
    function outside(event) { if (!container.current?.contains(event.target)) setOpen(false); }
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
    // Context actions delegate to a stable store; keep focus on the user's control during polls.
  }, [open]);
  return <div className="notification-center" ref={container}>
    <button ref={button} className="notification-bell" type="button" aria-expanded={open} aria-controls="notification-panel"
      aria-label={`Notifications${unreadCount === null ? '' : `, ${unreadCount} unread`}`} onClick={() => setOpen(!open)}>
      <Icon name="bell" size={22} />
      {unreadCount > 0 && <span className="notification-bell__badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      {error && <span className="notification-bell__warning" aria-hidden="true" />}
    </button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Notifications">
      <header className="notification-panel__header"><div><h2>Notifications</h2><p>{unreadCount === null ? 'Your latest activity' : `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`}</p></div>
        <button ref={closeButton} type="button" className="notification-icon-button" aria-label="Close notifications" onClick={() => { setOpen(false); button.current?.focus(); }}>×</button>
      </header>
      <div className="notification-panel__actions">
        <button type="button" disabled={busy || !unreadCount} onClick={notifications.markAllRead}>Mark all as read</button>
        <button type="button" disabled={busy} onClick={notifications.refresh}>Refresh</button>
        <details className="notification-menu" ref={actionsMenu}>
          <summary ref={menuButton} aria-label="Notification management actions">More <span aria-hidden="true">⋯</span></summary>
          <div className="notification-menu__options">
            <button type="button" disabled={busy || !loaded || (!items.some(item => item.readAt) && !notifications.nextCursor)} onClick={() => {
              actionsMenu.current.open = false; menuButton.current?.focus(); notifications.clearRead();
            }}>Clear all read</button>
            <button type="button" disabled={busy || !loaded || (!items.length && !notifications.nextCursor)} onClick={() => {
              actionsMenu.current.open = false; menuButton.current?.focus(); notifications.requestClearAll();
            }}>Clear all notifications</button>
          </div>
        </details>
      </div>
      <div className="notification-panel__scroll" aria-busy={busy}>
        {(error || actionError) && <div className="notification-panel__error" role="alert"><p>{(actionError || error).message}</p>
          {error?.code === 'SESSION_CHANGED' ? <button type="button" onClick={() => window.location.reload()}>Reload application</button> : <button type="button" disabled={busy} onClick={notifications.refresh}>Try again</button>}
        </div>}
        {!loaded && !error && <p className="notification-panel__placeholder" role="status">Loading notifications…</p>}
        {loaded && !items.length && <div className="notification-panel__empty"><Icon name="bell" size={30} /><h3>You’re all caught up</h3><p>Messages and collaboration updates will appear here.</p></div>}
        {items.length > 0 && <ol className="notification-list">{items.map(item => <li key={item.id} className={item.readAt ? 'notification-item' : 'notification-item notification-item--unread'}>
          <span className="notification-item__icon" aria-hidden="true"><Icon name={item.type === 'message' ? 'messages' : 'requests'} /></span>
          <div className="notification-item__content"><Link to={notificationPath(item)} onClick={event => {
            if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { notifications.markRead(item); setOpen(false); }
          }}>{notificationText(item)}</Link>
            <div className="notification-item__meta"><time dateTime={item.lastEventAt} title={new Date(item.lastEventAt).toLocaleString()}>{relativeNotificationTime(item.lastEventAt)}</time>{!item.readAt && <span className="notification-item__dot" aria-label="Unread" />}</div>
            <div className="notification-item__actions">
              {!item.readAt && <button type="button" className="notification-item__read" disabled={busy} onClick={() => notifications.markRead(item)}>Mark as read</button>}
              <button type="button" className="notification-item__clear" disabled={busy} aria-label={`Clear notification: ${notificationText(item)}`} onClick={async () => {
                await notifications.clearOne(item); closeButton.current?.focus();
              }}>Clear</button>
            </div>
          </div>
        </li>)}</ol>}
        {notifications.nextCursor && <button className="notification-panel__more" type="button" disabled={busy} onClick={notifications.loadMore}>{busy ? 'Please wait…' : 'Load more'}</button>}
      </div>
      <footer className="notification-panel__footer">{notifications.status.phase === 'offline' ? 'Offline. Updates resume when you reconnect.' : notifications.status.phase === 'retrying' ? 'Updates delayed. Retrying automatically.' : 'Updates automatically while you’re here.'}</footer>
      {notifications.confirmClearAllOpen && <dialog ref={clearDialog} className="notification-clear-dialog" aria-labelledby="notification-clear-title" aria-describedby="notification-clear-description"
        onCancel={event => { event.preventDefault(); notifications.cancelClearAll(); }}>
        <h2 id="notification-clear-title">Clear all notifications?</h2>
        <p id="notification-clear-description">This removes your read and unread notification history. Your messages, conversations and collaboration requests will remain untouched. This cannot be undone.</p>
        <div className="notification-clear-dialog__actions">
          <button type="button" className="button button--secondary" autoFocus onClick={notifications.cancelClearAll}>Cancel</button>
          <button type="button" className="button button--primary" disabled={busy} onClick={notifications.confirmClearAll}>Clear all notifications</button>
        </div>
      </dialog>}
    </section>}
  </div>;
}

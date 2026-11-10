# Private messaging interface — Steps 4 and 5

The interface is implemented. Message buttons on accepted requests and connected
developer cards/profiles open a conversation. The Messages navigation link opens
the paginated inbox. On narrow screens, a back arrow returns from chat to the inbox.

## Using the composer

- Type or paste plain text, multiline text, or emoji. Messages allow up to 2,000
  Unicode code points after trimming surrounding whitespace.
- Choose **Emoji** beside **Your message** to open a small set of common emoji.
  Selecting one inserts it at the cursor or replaces selected text, then returns
  focus to the message box. Tab navigates choices; Escape closes the picker.
- Click **Send message**, or press Ctrl+Enter / Command+Enter. Enter alone adds a line.
- Failed sends retain their original text and UUID for a safe manual retry. The
  composer and emoji picker cannot edit that pending attempt. A rate-limit response
  displays a countdown. Clearing a draft does not undo a possibly delivered message.
- Replies update automatically while this tab is visible and online. **Refresh
  messages** remains available for a manual check. **Load older messages** fetches
  earlier history.

Reopening a conversation starts with its latest 30 messages. When earlier history
exists, a persistent notice and **Load older messages** button appear above the
scrolling history. Scrolling upward near the top also fetches the next earlier page
automatically and preserves the reading position. At the oldest page, **Beginning
of conversation** confirms that all available history has been loaded. A failed
automatic older-page request requires the visible button to retry; scrolling does
not repeatedly issue the same failing request.

Tokens, drafts, and conversation data remain in memory. Navigating away or reloading
can discard an unsent draft; confirmed messages remain in the database. The frontend
renders message content as text and keeps bigint message IDs as strings.

## Verification

- Step 5 production build and 31 frontend automated checks passed, including
  scheduling, retries, cancellation, lifecycle events, and cursor catch-up.
- The 18 messaging API tests passed during Step 4 implementation.
- The owner reported that the local manual checklist passed, including multiline
  messages. Their emoji report was clarified as a missing picker button, rather
  than an emoji send failure. The picker was subsequently added, and the owner
  confirmed that it works. Step 4 manual verification is complete.
- The Step 5 integration check passed through the local Vite proxy and real API
  with two synthetic sessions: automatic receipt, Unicode persistence, overlapping
  send deduplication, pause/resume catch-up, stored inbox previews, and stopping on
  session expiry. Existing manual test accounts and messages were not reset.
- A follow-up regression check switches accounts within the same cookie session,
  verifies short-chat history, and retrieves all 35 messages in a paginated chat
  after another logout/login. Both history checks passed. The reported disappearing
  history was not reproduced at the API level; the UI now makes earlier pages
  explicit and loads them when scrolling upward.
- The owner also reported delayed history in short conversations. Initial inbox
  and chat loads previously shared the hidden-tab pause used for background polling.
  Explicit open/refresh requests now run independently of that pause and are not
  cancelled when the preview loses visibility. Tests cover hidden-preview loads,
  visibility changes during loading, refresh after cancellation, and account-switch
  cancellation. The owner subsequently confirmed that everything is working,
  completing manual verification of the history fix.

Final Step 6 checks and the Step 7 release status are recorded in
[MESSAGING_RELEASE.md](../../backend/docs/MESSAGING_RELEASE.md).

For a quick picker check, reload the app, open a conversation, select Emoji, choose
one, and send. In the other account, wait for the reply and confirm the same emoji
appears. Also check insertion in the middle of a draft and Escape to dismiss.

## Automatic updates

- An open conversation checks for replies every 3 seconds after the preceding read
  completes. The inbox refreshes its current page every 10 seconds without replacing
  existing content with a loading screen. Manual inbox Refresh returns to page one.
- Hidden tabs and offline browsers pause background reads and cancel in-flight
  background polling requests. Opening the inbox/chat or pressing Refresh starts an
  explicit read even when an embedded preview reports itself hidden; visibility
  changes do not cancel that explicit read. Returning to a visible, online tab
  resumes background updates from the last applied cursor. Switching conversations,
  reloading the hook, or logging out still cancels all old work, including explicit reads.
- Reads time out after 15 seconds. Temporary network/server errors use increasing
  retry delays capped at 30 seconds, respecting a longer server Retry-After value.
  Repeated refresh clicks cannot overlap reads or bypass that retry deadline.
- A backlog is drained in bounded batches, continuing immediately while more pages
  remain. Only fetched history advances the cursor; sends and older history do not.
  Merging by exact bigint IDs prevents duplicates and skipped concurrent replies.
- Access failures stop polling and clear the unavailable conversation. Other permanent
  failures require explicit Refresh or Retry. Transient failures retain displayed history.
- New messages keep the view at the bottom when already near it. When reading older
  history, the view stays put and **New messages ↓** provides a jump to the latest reply.
- Sending remains an explicit action. Polling never retries a failed send automatically.

To manually check Step 5, reload both test sessions, leave the receiving conversation
visible, and send from the other account. A reply should appear within roughly three
seconds plus network time without pressing Refresh. Leave the receiving tab, send
another message, then return and check catch-up. Scroll up before receiving a reply
to check the new-message button and preserved reading position.

## Repeatable local integration check

With Vite at port 5175 proxying exclusively to the isolated test backend:

```powershell
cd frontend
$env:INTEGRATION_TARGET_IS_TEST_DB = 'yes'
$env:INTEGRATION_ORIGIN = 'http://127.0.0.1:5175'
npm.cmd run check:messaging
```

This creates two fresh synthetic test accounts and a conversation. It does not reset
tables or remove previous test data. Do not point it at the application database.

No Supabase migration or deployment was performed as part of Steps 4–5. Local manual
testing uses the isolated database with migrations 001–003 already applied. Do not
run database-resetting backend tests against the database while preserving manual
test accounts or messages.

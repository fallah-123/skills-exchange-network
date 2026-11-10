import { useEffect, useId, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import './EmojiPicker.css';

const EMOJI = [
  ['😀', 'Grinning face'], ['😊', 'Smiling face'], ['😂', 'Laughing with tears'],
  ['😎', 'Sunglasses'], ['🤔', 'Thinking'], ['🥳', 'Celebrating'],
  ['👋', 'Wave'], ['👍', 'Thumbs up'], ['👏', 'Clapping'],
  ['🙌', 'Raised hands'], ['🤝', 'Handshake'], ['💪', 'Flexed arm'],
  ['❤️', 'Heart'], ['🎉', 'Party popper'], ['🚀', 'Rocket'],
  ['💡', 'Idea'], ['💻', 'Laptop'], ['✅', 'Check mark'],
];

export default function EmojiPicker({ disabled, onSelect }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const toggle = useRef(null);
  const firstEmoji = useRef(null);
  const panelId = useId();
  const visible = open && !disabled;

  useEffect(() => {
    if (!visible) return;
    firstEmoji.current?.focus();
    function dismiss(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [visible]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return <div className="emoji-picker" ref={root}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && visible) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
    <Button ref={toggle} variant="secondary" className="emoji-picker__toggle" disabled={disabled}
      aria-expanded={visible} aria-controls={panelId} aria-label="Choose an emoji" onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">😊</span> Emoji
    </Button>
    {visible && <div id={panelId} className="emoji-picker__panel" role="group" aria-label="Choose an emoji">
      <span className="emoji-picker__title">Add an emoji</span>
      <div className="emoji-picker__choices">
        {EMOJI.map(([emoji, label], index) => <button key={label} ref={index === 0 ? firstEmoji : undefined}
          type="button" className="emoji-picker__choice" aria-label={label} title={label}
          onClick={() => { setOpen(false); onSelect(emoji); }}><span aria-hidden="true">{emoji}</span></button>)}
      </div>
    </div>}
  </div>;
}

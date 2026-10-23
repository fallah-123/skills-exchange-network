// Visualizes the server-provided skill-overlap score.
import './ScoreBar.css';
import { MATCH_SCORE_MAX } from '../../constants.js';

/** Renders a labelled score bar without implying probability. */
export default function ScoreBar({ score }) {
  const boundedScore = Math.min(MATCH_SCORE_MAX, Math.max(0, Number(score) || 0));
  return (
    <div className="score-bar">
      <div className="score-bar__label">Match strength {boundedScore}%</div>
      <div className="score-bar__track" role="progressbar" aria-label="Match strength" aria-valuemin="0" aria-valuemax={MATCH_SCORE_MAX} aria-valuenow={boundedScore}>
        <span className="score-bar__fill" style={{ width: `${boundedScore}%` }} />
      </div>
    </div>
  );
}

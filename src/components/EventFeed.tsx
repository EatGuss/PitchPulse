/**
 * EventFeed — scrolling live feed of normalized match events.
 *
 * Subscribes to MatchSim via the shared bus and prepends new events at the top
 * (chronological-newest-first, like a real match ticker). For Gate 1 we render
 * the three MVP event types (goal, card, halfTime) plus fullTime; other types
 * are accepted by the bus but filtered here.
 */

import { useEffect, useRef, useState } from 'react';
import { teamAlias } from '../data/teamAliases';
import type { DemoUserId } from '../data/personas';
import { DEMO_USERS } from '../data/personas';
import type { MatchInfo, NormalizedEvent } from '../domain/types';
import './EventFeed.css';

export interface EventFeedProps {
  events: NormalizedEvent[];
  info: MatchInfo;
  /** Whose phone is this — used for the "your team scored!" framing copy. */
  viewerId: DemoUserId;
}

type DisplayableType =
  | 'goal'
  | 'card'
  | 'halfTime'
  | 'fullTime'
  | 'kickOff'
  | 'shotMissed'
  | 'shotBlocked'
  | 'shotSaved'
  | 'offside'
  | 'corner'
  | 'foul';
const DISPLAYABLE = new Set<DisplayableType>([
  'goal',
  'card',
  'halfTime',
  'fullTime',
  'kickOff',
  'shotMissed',
  'shotBlocked',
  'shotSaved',
  'offside',
  'corner',
  'foul',
]);

function isDisplayable(t: NormalizedEvent['type']): t is DisplayableType {
  return DISPLAYABLE.has(t as DisplayableType);
}

const FOUL_TYPE_LABEL: Record<string, string> = {
  foul: 'Foul',
  handBall: 'Handball',
  pullingShirt: 'Shirt pull',
  diving: 'Simulation',
};

function foulLabel(reason: string | undefined): string {
  if (!reason) return 'Foul';
  return FOUL_TYPE_LABEL[reason] ?? 'Foul';
}

function playerName(info: MatchInfo, playerId: string | undefined): string {
  if (!playerId) return '';
  for (const t of [info.teams.home, info.teams.guest]) {
    const p = t.players.find((p) => p.id === playerId);
    if (p) return `#${p.shirtNumber} ${p.shortName}`;
  }
  return playerId.split('-').pop() ?? '';
}

interface RowProps {
  event: NormalizedEvent;
  info: MatchInfo;
  viewerId: DemoUserId;
}

function FeedRow({ event, info, viewerId }: RowProps) {
  const viewer = DEMO_USERS[viewerId];
  const team = teamAlias(event.teamId);
  const player = playerName(info, event.playerId);
  const isViewerTeam = event.teamId === viewer.favoriteTeamId;

  switch (event.type) {
    case 'goal': {
      const assist = playerName(info, event.assistPlayerId);
      const sub = assist ? `Assist: ${assist}` : 'Solo run';
      return (
        <li className={`feed__row feed__row--goal ${isViewerTeam ? 'is-mine' : 'is-theirs'}`}>
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">⚽</span>
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}GOAL — {player}
            </div>
            <div className="feed__sub">{sub}{event.scoreAfter ? ` · ${event.scoreAfter.home}–${event.scoreAfter.guest}` : ''}</div>
          </div>
        </li>
      );
    }
    case 'card': {
      const isRed = event.cardColor === 'red' || event.cardColor === 'yellowRed';
      return (
        <li className={`feed__row feed__row--card`}>
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span
            className={`feed__card ${isRed ? 'feed__card--red' : 'feed__card--yellow'}`}
            aria-label={isRed ? 'Red card' : 'Yellow card'}
          />
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}Booked — {player}
            </div>
            <div className="feed__sub">Reason: {event.reason ?? 'foul'}</div>
          </div>
        </li>
      );
    }
    case 'halfTime':
      return (
        <li className="feed__row feed__row--whistle">
          <span className="feed__time tabular">HT</span>
          <span className="feed__icon" aria-hidden="true">⏸</span>
          <div className="feed__body">
            <div className="feed__title">Half time</div>
            <div className="feed__sub">
              {event.scoreAfter ? `${event.scoreAfter.home}–${event.scoreAfter.guest}` : ''}
            </div>
          </div>
        </li>
      );
    case 'fullTime':
      return (
        <li className="feed__row feed__row--whistle feed__row--ft">
          <span className="feed__time tabular">FT</span>
          <span className="feed__icon" aria-hidden="true">🏁</span>
          <div className="feed__body">
            <div className="feed__title">Full time</div>
            <div className="feed__sub">
              Final: {event.scoreAfter ? `${event.scoreAfter.home}–${event.scoreAfter.guest}` : ''}
            </div>
          </div>
        </li>
      );
    case 'kickOff':
      return (
        <li className="feed__row feed__row--kickoff">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">▶</span>
          <div className="feed__body">
            <div className="feed__title">Kick-off</div>
            <div className="feed__sub">{event.matchPhase === 'secondHalf' ? 'Second half underway' : 'Match underway'}</div>
          </div>
        </li>
      );
    case 'shotSaved':
      return (
        <li className="feed__row feed__row--shot feed__row--shot-on">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">🧤</span>
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}Shot saved{player ? ` — ${player}` : ''}
            </div>
            <div className="feed__sub">Keeper denied it — on target</div>
          </div>
        </li>
      );
    case 'shotMissed':
      return (
        <li className="feed__row feed__row--shot feed__row--shot-off">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">🎯</span>
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}Shot off target{player ? ` — ${player}` : ''}
            </div>
            <div className="feed__sub">Wide of the post</div>
          </div>
        </li>
      );
    case 'shotBlocked':
      return (
        <li className="feed__row feed__row--shot feed__row--shot-off">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">🛡</span>
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}Shot blocked{player ? ` — ${player}` : ''}
            </div>
            <div className="feed__sub">Defender in the way</div>
          </div>
        </li>
      );
    case 'offside':
      return (
        <li className="feed__row feed__row--offside">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">🚩</span>
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}Offside{player ? ` — ${player}` : ''}
            </div>
            <div className="feed__sub">Flag's up</div>
          </div>
        </li>
      );
    case 'corner':
      return (
        <li className="feed__row feed__row--corner">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">⛳</span>
          <div className="feed__body">
            <div className="feed__title">
              <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
              {' '}Corner kick
            </div>
            <div className="feed__sub">Set piece chance</div>
          </div>
        </li>
      );
    case 'foul':
      return (
        <li className="feed__row feed__row--foul">
          <span className="feed__time tabular">{event.displayMinute}</span>
          <span className="feed__icon" aria-hidden="true">✋</span>
          <div className="feed__body">
            <div className="feed__title">
              {event.teamId ? (
                <>
                  <span className="feed__team" style={{ color: team.accent }}>{team.code}</span>
                  {' '}
                </>
              ) : null}
              {foulLabel(event.reason)}{player ? ` — ${player}` : ''}
            </div>
            <div className="feed__sub">Free kick awarded</div>
          </div>
        </li>
      );
  }
}

export function EventFeed({ events, info, viewerId }: EventFeedProps) {
  // Only render the headline event types in MVP — others are still in the
  // bus and the underlying log, but the feed itself stays uncluttered.
  const visible = events.filter((e) => isDisplayable(e.type)).slice().reverse();
  const listRef = useRef<HTMLUListElement>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const newest = visible[0];
    if (!newest) return;
    if (newest.type === 'goal') {
      setFlash(newest.id);
      const t = setTimeout(() => setFlash(null), 1800);
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return () => clearTimeout(t);
    }
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={`feed ${flash ? 'feed--flash' : ''}`} aria-label="Live event feed">
      <h2 className="feed__h">Live feed</h2>
      {visible.length === 0 ? (
        <div className="feed__empty">
          Waiting for kick-off…
          <span className="feed__empty-sub">Tap “Start match” below to begin the replay.</span>
        </div>
      ) : (
        <ul ref={listRef} className="feed__list">
          {visible.map((e) => (
            <FeedRow key={e.id} event={e} info={info} viewerId={viewerId} />
          ))}
        </ul>
      )}
    </section>
  );
}

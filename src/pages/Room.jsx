import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import Artwork from "../components/Artwork";
import EmptyState from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import SignInDialog from "../components/SignInDialog";
import { useAuth } from "../state/AuthContext";
import { useRoom } from "../state/RoomContext";
import { usePlayer } from "../state/PlayerContext";
import { useUI } from "../state/UIContext";
import { normaliseCode, VISIBILITY } from "../services/rooms";
import { shareLink } from "../utils/share";
import { useSeo } from "../hooks/useSeo";

/** /room: start or join a session. /room/:code: the session itself. */
export default function RoomPage() {
  useSeo({ title: "Listen Together", noindex: true });
  const { code: urlCode } = useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const room = useRoom();
  const { toast, openModal } = useUI();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [visibility, setVisibility] = useState(VISIBILITY.PUBLIC);
  const wanted = normaliseCode(urlCode);

  // Opening an invite link joins that room.
  useEffect(() => {
    if (!wanted || !user || room.code === wanted) return;
    setNotFound(false);
    room.join(wanted)
      .then((ok) => { if (!ok) setNotFound(true); })
      .catch((e) => {
        toast(e.message || "Couldn't join the room.", { tone: "error", icon: "warning" });
        navigate("/room");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, user?.uid]);

  if (!room.enabled) {
    return (
      <div className="page">
        <EmptyState icon="people" title="Listen Together is off" message="It needs the Firebase Realtime Database, which is not set up on this site." />
      </div>
    );
  }

  if (ready && !user) {
    return (
      <div className="page">
        <EmptyState
          icon="people"
          title="Listen together"
          message="Sign in to start a room or join one, and hear the same song at the same time as your friends."
          action="Sign in"
          onAction={() => openModal({ title: "Sign in", bare: true, body: <SignInDialog /> })}
        />
      </div>
    );
  }

  const start = async () => {
    setBusy(true);
    try {
      const code = await room.create(visibility);
      navigate(`/room/${code}`);
    } catch (e) {
      toast(e.message || "Couldn't start a room.", { tone: "error", icon: "warning" });
    } finally {
      setBusy(false);
    }
  };

  const enter = (e) => {
    e.preventDefault();
    const code = normaliseCode(input);
    if (code.length === 6) navigate(`/room/${code}`);
    else toast("Room codes have 6 characters.", { icon: "warning" });
  };

  // ------------------------------------------------------------ lobby
  if (!wanted) {
    return (
      <div className="page room">
        <header className="room__head">
          <h1 className="page__title">Listen Together</h1>
          <p className="room__lede">Start a room and share the code. Everyone hears what you play, in sync.</p>
        </header>
        {room.code ? (
          <button type="button" className="btn btn--primary" onClick={() => navigate(`/room/${room.code}`)}>
            <Icon name="people" size={16} /><span>Back to room {room.code}</span>
          </button>
        ) : (
          <div className="room__lobby">
            <section className="room__card">
              <h2>Host a room</h2>
              <p>You control the music. Friends join with a code or link.</p>
              <VisibilityPicker value={visibility} onChange={setVisibility} />
              <button type="button" className="btn btn--primary" onClick={start} disabled={busy}>
                <Icon name="radio" size={16} /><span>{busy ? "Starting…" : "Start a room"}</span>
              </button>
            </section>
            <section className="room__card">
              <h2>Join a room</h2>
              <form className="room__join" onSubmit={enter}>
                <input
                  className="field__input room__code-input"
                  value={input}
                  onChange={(e) => setInput(normaliseCode(e.target.value))}
                  placeholder="ABC234"
                  aria-label="Room code"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button type="submit" className="btn" disabled={normaliseCode(input).length !== 6}>Join</button>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- room
  if (notFound) {
    return (
      <div className="page">
        <EmptyState icon="people" title="Room not found" message="It may have ended. Check the code and try again." action="Back" onAction={() => navigate("/room")} />
      </div>
    );
  }
  if (room.code !== wanted || !room.room) return <div className="page"><SkeletonRows count={4} /></div>;

  return <RoomSession />;
}

function RoomSession() {
  const navigate = useNavigate();
  const { code, room, isHost, members, leave, end, needsTap, sync, visibility, setVisibility } = useRoom();
  const { currentTrack, isPlaying } = usePlayer();
  const { toast } = useUI();
  const host = members.find((m) => m.isHost);
  const shared = room.state?.track;
  const nowPlaying = isHost ? currentTrack : shared;
  const inviteUrl = `${window.location.origin}/room/${code}`;

  const invite = async () => {
    const message = await shareLink({ title: "Listen with me", text: `Join my Listen Together room (${code})`, url: inviteUrl });
    if (message) toast(message, { icon: "check" });
  };

  const exit = async () => {
    await (isHost ? end() : leave());
    navigate("/room");
  };

  return (
    <div className="page room">
      <header className="room__head">
        <p className="room__kind">
          <span className="room__live" aria-hidden="true" /> Live room
          <span className="room__tag">{visibility === VISIBILITY.FRIENDS ? "Friends only" : "Anyone with the link"}</span>
        </p>
        <h1 className="page__title room__code">{code}</h1>
        <p className="room__lede">
          {isHost ? "You're the host. Play anything and everyone here hears it." : `${host?.name || "The host"} is choosing the music.`}
        </p>
        <div className="room__actions">
          <button type="button" className="btn btn--primary" onClick={invite}>
            <Icon name="share" size={16} /><span>Invite</span>
          </button>
          <button type="button" className="btn" onClick={exit}>
            <Icon name="close" size={16} /><span>{isHost ? "End room" : "Leave"}</span>
          </button>
        </div>
      </header>

      {isHost ? (
        <section className="room__now">
          <h2 className="room__subhead">Who can join</h2>
          <VisibilityPicker
            value={visibility}
            onChange={(next) => setVisibility(next).catch(() => toast("Couldn't change who can join.", { tone: "error" }))}
          />
        </section>
      ) : null}

      {needsTap ? (
        <button type="button" className="room__tap" onClick={sync}>
          <span className="room__tap-icon"><Icon name="play" size={22} /></span>
          <span>
            <strong>Tap to listen along</strong>
            <small>Your browser needs a tap before it can play the host's music.</small>
          </span>
        </button>
      ) : null}

      <section className="room__now">
        <h2 className="room__subhead">Now playing</h2>
        {nowPlaying?.id ? (
          <div className="room__track">
            <Artwork src={nowPlaying.artwork} size={64} rounded={false} className="room__art" />
            <div>
              <p className="room__title">{nowPlaying.title}</p>
              <p className="room__artist">{(nowPlaying.artists || []).join(", ")}</p>
              <p className="room__state">
                {(isHost ? isPlaying : room.state?.isPlaying) ? "Playing" : "Paused"}
                {isHost ? "" : " · the host controls play, pause and seeking"}
              </p>
            </div>
          </div>
        ) : (
          <p className="room__empty">
            {isHost ? "Nothing yet. Pick a song from Home or Search to start." : "Waiting for the host to play something…"}
          </p>
        )}
      </section>

      <section className="room__members">
        <h2 className="room__subhead">Listening ({members.length})</h2>
        <ul>
          {members.map((m) => (
            <li key={m.uid} className="room__member">
              {m.photo ? (
                <img src={m.photo} alt="" className="room__avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="room__avatar room__avatar--initial">{(m.name || "?").charAt(0).toUpperCase()}</span>
              )}
              <span>{m.name}</span>
              {m.isHost ? <span className="room__tag">Host</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function VisibilityPicker({ value, onChange }) {
  const options = [
    { id: VISIBILITY.PUBLIC, label: "Anyone with the link", hint: "Share the code with anyone." },
    { id: VISIBILITY.FRIENDS, label: "Friends only", hint: "Only your friends can join." },
  ];
  return (
    <div className="room__visibility" role="radiogroup" aria-label="Who can join">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`room__visibility-option${value === o.id ? " is-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          <strong>{o.label}</strong>
          <small>{o.hint}</small>
        </button>
      ))}
    </div>
  );
}

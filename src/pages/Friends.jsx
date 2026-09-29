import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Artwork from "../components/Artwork";
import EmptyState from "../components/EmptyState";
import SignInDialog from "../components/SignInDialog";
import UsernameForm from "../components/UsernameForm";
import { useAuth } from "../state/AuthContext";
import { useFriends } from "../state/FriendsContext";
import { usePlayer } from "../state/PlayerContext";
import { useRoom } from "../state/RoomContext";
import { useUI } from "../state/UIContext";
import { getTrack } from "../services/musicService";
import { rememberRoomTrack } from "../services/rooms";
import { formatRelativeTime } from "../utils/format";
import { useSeo } from "../hooks/useSeo";

/** Friends by email, who's online, what they're playing, and one tap to join their room. */
export default function FriendsPage() {
  useSeo({ title: "Friends", noindex: true });
  const { ready } = useAuth();
  const { openModal } = useUI();
  const fr = useFriends();

  if (!fr.enabled) {
    return (
      <div className="page">
        <EmptyState icon="people" title="Friends are off" message="They need the Firebase Realtime Database, which is not set up on this site." />
      </div>
    );
  }

  if (ready && !fr.signedIn) {
    return (
      <div className="page">
        <EmptyState
          icon="people"
          title="Listen with friends"
          message="Sign in with an account to add friends by username or email, see what they're playing and join their rooms."
          action="Sign in"
          onAction={() => openModal({ title: "Sign in", bare: true, body: <SignInDialog /> })}
        />
      </div>
    );
  }

  return (
    <div className="page friends">
      <header className="friends__head">
        <h1 className="page__title">Friends</h1>
        <p className="room__lede">See who's online and what they're listening to. Jump into their room to hear it together.</p>
      </header>

      <UsernameForm />
      <AddFriend />

      {fr.requests.length ? (
        <section className="friends__section">
          <h2 className="room__subhead">Friend requests ({fr.requests.length})</h2>
          <ul className="friends__list">
            {fr.requests.map((r) => <RequestRow key={r.uid} person={r} />)}
          </ul>
        </section>
      ) : null}

      <section className="friends__section">
        <h2 className="room__subhead">
          Your friends · {fr.onlineCount} online
        </h2>
        {fr.friends.length ? (
          <ul className="friends__list">
            {fr.friends.map((f) => <FriendRow key={f.uid} friend={f} />)}
          </ul>
        ) : (
          <p className="room__empty">No friends yet. Add someone by their username or the email they sign in with.</p>
        )}
      </section>

      {fr.sent.length ? (
        <section className="friends__section">
          <h2 className="room__subhead">Sent requests</h2>
          <ul className="friends__list">
            {fr.sent.map((s) => (
              <li key={s.uid} className="friend">
                <Avatar person={s} />
                <div className="friend__body">
                  <p className="friend__name">{s.name}</p>
                  <p className="friend__status">Waiting for them to accept</p>
                </div>
                <button type="button" className="btn btn--small" onClick={() => fr.cancel(s.uid)}>Cancel</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <label className="friends__privacy">
        <input type="checkbox" checked={fr.hidden} onChange={(e) => fr.setHidden(e.target.checked)} />
        <span>
          <strong>Hide what I'm listening to</strong>
          <small>Friends still see when you're online, but not your song or room.</small>
        </span>
      </label>
    </div>
  );
}

function AddFriend() {
  const { add } = useFriends();
  const { toast } = useUI();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await add(email);
      const messages = {
        sent: "Friend request sent.",
        accepted: "They'd already asked you. You're now friends!",
        friends: "You're already friends.",
      };
      toast(messages[result], { icon: "check" });
      setEmail("");
    } catch (error) {
      toast(error.message || "Couldn't send the request.", { tone: "error", icon: "warning" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="room__card friends__add" onSubmit={submit}>
      <h2>Add a friend</h2>
      <div className="room__join">
        <input
          className="field__input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="@username or friend@example.com"
          aria-label="Friend's username or email"
          autoComplete="off"
          required
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}

function RequestRow({ person }) {
  const { accept, decline } = useFriends();
  const { toast } = useUI();
  const run = (fn, message) => fn(person.uid)
    .then(() => message && toast(message, { icon: "check" }))
    .catch(() => toast("Something went wrong. Try again.", { tone: "error", icon: "warning" }));

  return (
    <li className="friend">
      <Avatar person={person} />
      <div className="friend__body">
        <p className="friend__name">{person.name}</p>
        <p className="friend__status">Wants to be friends</p>
      </div>
      <div className="friend__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={() => run(accept, `You're now friends with ${person.name}.`)}>Accept</button>
        <button type="button" className="btn btn--small" onClick={() => run(decline)}>Decline</button>
      </div>
    </li>
  );
}

export function FriendRow({ friend, compact = false }) {
  const navigate = useNavigate();
  const { remove } = useFriends();
  const { code } = useRoom();
  const { playTracks } = usePlayer();
  const { toast } = useUI();
  const inRoom = Boolean(friend.online && friend.roomCode);
  const listening = friend.online && friend.track?.id;

  const join = () => navigate(`/room/${friend.roomCode}`);
  const playToo = async () => {
    rememberRoomTrack(friend.track);
    const next = await getTrack(friend.track.id).catch(() => null);
    if (next) playTracks([next], 0, `With ${friend.name}`);
    else toast("Couldn't load that song.", { tone: "error" });
  };
  const unfriend = () => {
    // eslint-disable-next-line no-alert
    if (window.confirm(`Remove ${friend.name} from your friends?`)) remove(friend.uid).catch(() => {});
  };

  let status;
  if (!friend.online) status = friend.lastSeen ? `Last seen ${formatRelativeTime(friend.lastSeen).toLowerCase()}` : "Offline";
  else if (inRoom) status = friend.roomHost ? "Hosting a room" : "In a room";
  else if (listening) status = friend.isPlaying ? "Listening" : "Paused";
  else status = "Online";

  return (
    <li className={`friend${compact ? " friend--compact" : ""}`}>
      <Avatar person={friend} online={friend.online} />
      <div className="friend__body">
        <p className="friend__name">
          {friend.name}
          {friend.username && !compact ? <span className="friend__handle"> @{friend.username}</span> : null}
        </p>
        <p className={`friend__status${friend.online ? " is-online" : ""}`}>{status}</p>
        {listening ? (
          <div className="friend__track">
            {!compact ? <Artwork src={friend.track.artwork} size={32} rounded={false} className="friend__art" /> : null}
            <span>
              {friend.isPlaying ? <Icon name="music" size={12} /> : null} {friend.track.title}
              {friend.track.artists?.length ? ` · ${friend.track.artists.join(", ")}` : ""}
            </span>
          </div>
        ) : null}
      </div>
      <div className="friend__actions">
        {inRoom ? (
          code === friend.roomCode ? (
            <button type="button" className="btn btn--small" onClick={join}>In room</button>
          ) : (
            <button type="button" className="btn btn--primary btn--small" onClick={join}>
              <Icon name="people" size={14} /><span>Join</span>
            </button>
          )
        ) : listening ? (
          <button type="button" className="btn btn--small" onClick={playToo} title="Play the same song">
            <Icon name="play" size={14} /><span>Play</span>
          </button>
        ) : null}
        {!compact ? (
          <button type="button" className="icon-btn" onClick={unfriend} aria-label={`Remove ${friend.name}`}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Avatar({ person, online }) {
  return (
    <span className="friend__avatar-wrap">
      {person.photo ? (
        <img src={person.photo} alt="" className="room__avatar" referrerPolicy="no-referrer" />
      ) : (
        <span className="room__avatar room__avatar--initial">{(person.name || "?").charAt(0).toUpperCase()}</span>
      )}
      {online !== undefined ? <span className={`friend__dot${online ? " is-online" : ""}`} aria-label={online ? "Online" : "Offline"} /> : null}
    </span>
  );
}

import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { pluralize } from "../utils/format";
import { useRoom } from "../state/RoomContext";

/**
 * Desktop navigation. Hidden below the tablet breakpoint, where MobileNav
 * takes over — the two are separate components rather than one that shrinks,
 * because the phone layout is a genuinely different structure.
 */
export default function Sidebar() {
  const { playlists, createPlaylist, liked } = useLibrary();
  const { toast } = useUI();
  const { code: roomCode } = useRoom();
  const navigate = useNavigate();

  const newPlaylist = () => {
    const playlist = createPlaylist({ name: `My Playlist #${playlists.length + 1}` });
    toast("Playlist created", { icon: "check" });
    navigate(`/playlist/${playlist.id}`);
  };

  const linkClass = ({ isActive }) => `nav-link${isActive ? " is-active" : ""}`;

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar__brand">
        <Icon name="music" size={28} className="sidebar__logo" />
        <span>Resonate</span>
      </div>

      <ul className="sidebar__primary">
        <li>
          <NavLink to="/" end className={linkClass}>
            <Icon name="home" size={22} />
            <span>Home</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/search" className={linkClass}>
            <Icon name="search" size={22} />
            <span>Search</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/library" className={linkClass}>
            <Icon name="library" size={22} />
            <span>Your Library</span>
          </NavLink>
        </li>
      </ul>

      <ul className="sidebar__secondary">
        <li>
          <NavLink to="/liked" className={linkClass}>
            <span className="sidebar__tile sidebar__tile--liked">
              <Icon name="heart" size={14} />
            </span>
            <span className="sidebar__tile-label">
              Liked Songs
              <small>{pluralize(liked.length, "song")}</small>
            </span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/recent" className={linkClass}>
            <span className="sidebar__tile sidebar__tile--recent">
              <Icon name="clock" size={14} />
            </span>
            <span className="sidebar__tile-label">Recently Played</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/stats" className={linkClass}>
            <span className="sidebar__tile sidebar__tile--stats">
              <Icon name="chart" size={14} />
            </span>
            <span className="sidebar__tile-label">Your Stats</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/ai" className={linkClass}>
            <span className="sidebar__tile sidebar__tile--ai">
              <Icon name="radio" size={14} />
            </span>
            <span className="sidebar__tile-label">AI Playlist Maker</span>
          </NavLink>
        </li>
        <li>
          <NavLink to={roomCode ? `/room/${roomCode}` : "/room"} className={linkClass}>
            <span className="sidebar__tile sidebar__tile--room">
              <Icon name="people" size={14} />
            </span>
            <span className="sidebar__tile-label">
              Listen Together
              {roomCode ? <small className="sidebar__live">Live · {roomCode}</small> : null}
            </span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/local" className={linkClass}>
            <span className="sidebar__tile sidebar__tile--local">
              <Icon name="device" size={14} />
            </span>
            <span className="sidebar__tile-label">Your Uploads</span>
          </NavLink>
        </li>
      </ul>

      <div className="sidebar__playlists-head">
        <h2>Playlists</h2>
        <button type="button" className="icon-btn" onClick={newPlaylist} aria-label="Create playlist">
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div className="sidebar__playlists">
        {playlists.length === 0 ? (
          <p className="sidebar__hint">
            Playlists you create appear here.
          </p>
        ) : (
          <ul>
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <NavLink
                  to={`/playlist/${playlist.id}`}
                  className={({ isActive }) => `sidebar__playlist${isActive ? " is-active" : ""}`}
                >
                  <span className="sidebar__playlist-name">{playlist.name}</span>
                  {playlist.shared ? (
                    <Icon name="people" size={14} className="sidebar__playlist-shared" />
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}

import React from "react";
import { useParams } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import TrackList from "../components/TrackList";
import Shelf from "../components/Shelf";
import Card from "../components/Card";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useAsync } from "../hooks/useAsync";
import {
  getArtist,
  getTracks,
  getRelatedArtists,
  getAlbum,
  getArtistTopTracks,
} from "../services/musicService";
import { pluralize } from "../utils/format";
import { useSeo } from "../hooks/useSeo";

export default function ArtistPage() {
  const { id } = useParams();
  const { playTracks, shufflePlay, togglePlay, currentTrack } = usePlayer();

  const { data, loading, error, retry } = useAsync(async () => {
    const artist = await getArtist(id);
    if (!artist) return null;

    const [allTracks, topTracks, related, albums] = await Promise.all([
      getTracks(artist.trackIds),
      getArtistTopTracks(id, 5),
      getRelatedArtists(id),
      Promise.all(artist.albumIds.map((albumId) => getAlbum(albumId))),
    ]);

    return { artist, allTracks, topTracks, related, albums: albums.filter(Boolean) };
  }, [id]);
  const seoArtist = data?.artist;
  useSeo({
    title: seoArtist ? `${seoArtist.name} – songs & albums` : undefined,
    description: seoArtist ? `Listen to ${seoArtist.name}: top songs, albums and similar artists on Resonate.` : undefined,
    image: seoArtist?.artwork,
  });

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (loading) return <div className="page"><SkeletonRows count={6} /></div>;
  if (!data) {
    return (
      <div className="page">
        <EmptyState icon="artist" title="Artist not found" message="This artist is not in your library." />
      </div>
    );
  }

  const { artist, allTracks, topTracks, related, albums } = data;
  const playingHere = allTracks.some((track) => track.id === currentTrack?.id);

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind="Artist"
        title={artist.name}
        artwork={artist.artwork}
        round
        tracks={allTracks}
        meta={[pluralize(albums.length, "release")]}
        onPlay={() => (playingHere ? togglePlay() : playTracks(allTracks, 0, artist.name))}
        onShuffle={() => shufflePlay(allTracks, artist.name)}
      />

      {topTracks.length > 0 ? (
        <section className="artist__section">
          <h2 className="artist__heading">Popular</h2>
          <TrackList tracks={topTracks} contextLabel={artist.name} />
        </section>
      ) : null}

      {albums.length > 0 ? (
        <Shelf title="Releases">
          {albums.map((album) => (
            <Card
              key={album.id}
              to={`/album/${album.id}`}
              title={album.title}
              subtitle={`${album.year} • ${album.type}`}
              artwork={album.artwork}
            />
          ))}
        </Shelf>
      ) : null}

      {related.length > 0 ? (
        <Shelf title="Appears with" subtitle="Artists credited on the same tracks.">
          {related.map((other) => (
            <Card
              key={other.id}
              to={`/artist/${other.id}`}
              title={other.name}
              subtitle="Artist"
              artwork={other.artwork}
              round
            />
          ))}
        </Shelf>
      ) : null}
    </div>
  );
}

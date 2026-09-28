import React from "react";
import { Link, useParams } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import TrackList from "../components/TrackList";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useAsync } from "../hooks/useAsync";
import { getAlbum, getTracks } from "../services/musicService";
import { useSeo } from "../hooks/useSeo";

export default function AlbumPage() {
  const { id } = useParams();
  const { playTracks, shufflePlay, togglePlay, currentTrack } = usePlayer();

  const { data, loading, error, retry } = useAsync(async () => {
    const album = await getAlbum(id);
    if (!album) return null;
    return { album, tracks: await getTracks(album.trackIds) };
  }, [id]);
  const seoAlbum = data?.album;
  useSeo({
    title: seoAlbum?.title,
    description: seoAlbum ? `Listen to ${seoAlbum.title}${seoAlbum.artist ? ` by ${seoAlbum.artist}` : ""} on Resonate.` : undefined,
    image: seoAlbum?.artwork,
  });

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (loading) return <div className="page"><SkeletonRows count={8} /></div>;
  if (!data) {
    return (
      <div className="page">
        <EmptyState icon="album" title="Album not found" message="This album is no longer in your library." />
      </div>
    );
  }

  const { album, tracks } = data;
  const playingHere = tracks.some((track) => track.id === currentTrack?.id);

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind={album.type}
        title={album.title}
        artwork={album.artwork}
        tracks={tracks}
        meta={[
          album.artistIds.length > 0 ? (
            <Link key="artist" to={`/artist/${album.artistIds[0]}`} className="collection-head__link">
              {album.artistNames.join(", ")}
            </Link>
          ) : null,
          album.year,
        ]}
        onPlay={() => (playingHere ? togglePlay() : playTracks(tracks, 0, album.title))}
        onShuffle={() => shufflePlay(tracks, album.title)}
      />

      {tracks.length === 0 ? (
        <EmptyState icon="music" title="No tracks in this album" />
      ) : (
        <TrackList tracks={tracks} contextLabel={album.title} showArtwork={false} />
      )}
    </div>
  );
}

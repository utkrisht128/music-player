import React, { useState,useEffect,useRef } from "react";
import "./Home.css";
import hiddengems from "./images/hiddengems.jpg";
import smw from "./images/295.jpg";
import notbychance from "./images/notbychance.jpg";
import excuses from "./images/Excuses.jpg";
import play from "./images/play-512.png";
import pause from "./images/pause-512.png";
import next from "./images/media-step-forward-512.png";
import previous from "./images/media-step-backward-512.png";
import loop from "./images/loop-512.png";
import volume from "./images/volume-up-4-512.png";
import ncr from "./images/ncr.jpg";
import werollin from "./images/werollin.jpg";
import gunday from "./images/gunday.jpg";
import { Scrollbars } from "react-custom-scrollbars-2";
import Desire from "./music/Desires.mp3"
import Smw from "./music/295.mp3"
import TereTe from "./music/TereTe.mp3"
import MajheAale from "./music/MajheAale.mp3"
import Spaceship from "./music/Spaceship.mp3"
import War from "./music/War.mp3"
import AgainstAllOdds from "./music/AgainstAllOdds.mp3"
import Fate from "./music/Fate.mp3"
import Drip from "./music/Drip.mp3"
import Takeover from "./music/Takeover.mp3"
import Chances from "./music/Chances.mp3"
import SaadaPyar from "./music/SaadaPyar.mp3"
import Foreigns from "./music/Foreigns.mp3"
import Goat from "./music/Goat.mp3"
import Excuses from "./music/Excuses.mp3"
import Ncr from "./music/NCR.mp3"
import Gunday from "./music/Gunday .mp3"
import WeRollin from "./music/WeRollin.mp3"

function Home() {
  const [songs, setSongs] = useState([
    {
      id: "1.",
      title: "Desire",
      artist: "Ap Dhillon,Gurinder Gill",
      img_src: hiddengems,
      src: Desire
    },
    {
      id: "2.",
      title: "TERE TE",
      artist: "Ap Dhillon,Gurinder Gill",
      img_src: hiddengems,
      src: TereTe
    },
    {
      id: "3.",
      title: "MAJHE AALE",
      artist: "Ap Dhillon,Shinda Kahlon,Gurinder Gill,Gminxr",
      img_src: hiddengems,
      src: MajheAale
    },
    {
      id: "4.",
      title: "SPACESHIP",
      artist: "Ap Dhillon,Shinda Kahlon,Gminxr",
      img_src: hiddengems,
      src: Spaceship
    },
    {
      id: "5.",
      title: "WAR",
      artist: "Ap Dhillon,Gurinder Gill",
      img_src: hiddengems,
      src: War
    },
    {
      id: "6.",
      title: "AGAINST ALL ODD",
      artist: "Ap Dhillon,Gurinder Gill,Shinda Kahlon,Gminxr",
      img_src: hiddengems,
      src: AgainstAllOdds
    },
    {
      id: "7.",
      title: "295",
      artist: "Sidhu Moose Wala",
      img_src: smw,
      src: Smw
    },
    {
      id: "8.",
      title: "FATE",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik,Shinda Kahlon",
      img_src: notbychance,
      src: Fate
    },
    {
      id: "9.",
      title: "DRIP",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik,Duvy",
      img_src: notbychance,
      src: Drip
    },
    {
      id: "10.",
      title: "TAKEOVER",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik,AR Paisley",
      img_src: notbychance,
      src: Takeover
    },
    {
      id: "11.",
      title: "CHANCES",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik",
      img_src: notbychance,
      src: Chances
    },
    {
      id: "12.",
      title: "SADDA PYAAR",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik",
      img_src: notbychance,
      src: SaadaPyar
    },
    {
      id: "13.",
      title: "FOREIGNS",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik",
      img_src: notbychance,
      src: Foreigns
    },
    {
      id: "14.",
      title: "GOAT",
      artist: "Ap Dhillon,Gurinder Gill,Money Musik",
      img_src: notbychance,
      src: Goat
    },
    {
      id: "15.",
      title: "EXCUSES",
      artist: "Ap Dhillon,Gurinder Gill,Intense",
      img_src: excuses,
      src: Excuses
    },
    {
      id: "16.",
      title: "NCR TITLE SONG",
      artist: "TimeLiners",
      img_src: ncr,
      src: Ncr
    },
    {
      id: "17.",
      title: "WE ROLLIN",
      artist: "Shubh",
      img_src: werollin,
      src: WeRollin
    },
    {
      id: "18.",
      title: "GUNDAY",
      artist: "Pranjal Dahiya,Devender Ahlawat,Nitin Gill",
      img_src: gunday,
      src: Gunday
    },
  ]);
 
  let [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [nextSongIndex, setNextSongIndex] = useState(currentSongIndex + 1);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  useEffect(() => {
    setNextSongIndex(()=>{

      if(currentSongIndex+1>songs.length-1)
      {
        return 0;
      }else{
        return currentSongIndex+1;
      }
    });
  }, [currentSongIndex]);
  const audioEl = useRef(null);
  const clickref=useRef();
  const [isPlaying, setIsPlaying] = useState(false);

  
  useEffect(() => {
    if (isPlaying) {
        audioEl.current.play();
    } else {
        audioEl.current.pause();
    }
});
const SkipSong = (forwards = true) => {
    if (forwards) {
        setCurrentSongIndex(() => {
            let temp = currentSongIndex;
            temp++;

            if (temp > songs.length - 1) {
                temp = 0;
            }

            return temp;
        });
    } else {
        setCurrentSongIndex(() => {
            let temp = currentSongIndex;
            temp--;

            if (temp < 0) {
                temp = songs.length - 1;
            }

            return temp;
        });
    }
}
const handlediv1=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=0)
  audioEl.current.play();
}
const handlediv2=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=1)
  audioEl.current.play();
}
const handlediv3=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=2)
  audioEl.current.play();
}
const handlediv4=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=3)
  audioEl.current.play();
}
const handlediv5=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=4)
  audioEl.current.play();
}
const handlediv6=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=5)
  audioEl.current.play();
}
const handlediv7=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=6)
  audioEl.current.play();
}
const handlediv8=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=7)
  audioEl.current.play();
}
const handlediv9=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=8)
  audioEl.current.play();
}
const handlediv10=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=9)
  audioEl.current.play();
}
const handlediv11=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=10)
  audioEl.current.play();
}
const handlediv12=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=11)
  audioEl.current.play();
}
const handlediv13=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=12)
  audioEl.current.play();
}
const handlediv14=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=13)
  audioEl.current.play();
}
const handlediv15=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=14)
  audioEl.current.play();
}
const handlediv16=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=15)
  audioEl.current.play();
}
const handlediv17=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=16)
  audioEl.current.play();
}
const handlediv18=()=>{
  audioEl.current.pause();
  setCurrentSongIndex(currentSongIndex=17)
  audioEl.current.play();
}
const onPlaying=()=>{
  const temp=audioEl.current.duration;
  const min=parseInt(temp/60);
  setDuration(min);
  const ct=audioEl.current.currentTime;
  const progress=parseInt((ct/temp)*100);
  setCurrentTime(progress);
}
const checkwidth=(e)=>{
  const temp=audioEl.current.duration;
  let width=clickref.current.clientWidth;
  const offset=e.nativeEvent.offsetX;
  const divprogress=offset/width*100;
  audioEl.current.currentTime=divprogress/100*temp;
}
  return (
    <>
      <section className="main">
        <div className="playlist">
          <div className="grid">
            <Scrollbars  style={{ width: 500, height: 580 }}>
              <div className="item" onClick={handlediv1}>
              {songs[0].id} {songs[0].title}
                <br /> <span className="artist">
                {songs[1].artist}
                </span>{" "}
              </div>
              <div className="item" onClick={handlediv2}>
                {songs[1].id} {songs[1].title} <br />
                <span className="artist">{songs[1].artist}</span>
              </div>
              <div className="item" onClick={handlediv3}>
              {songs[2].id} {songs[2].title} <br />
                <span className="artist">
                {songs[2].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv4}>
              {songs[3].id} {songs[3].title} <br />
                <span className="artist">{songs[3].artist}</span>
              </div>
              <div className="item" onClick={handlediv5}>
              {songs[4].id} {songs[4].title} <br />
                <span className="artist">{songs[4].artist}</span>
              </div>
              <div className="item" onClick={handlediv6}>
              {songs[5].id} {songs[5].title} <br />
                <span className="artist">
                {songs[5].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv7}>
              {songs[6].id} {songs[6].title} <br /> <span className="artist">{songs[6].artist}</span>
              </div>
              <div className="item" onClick={handlediv8}>
              {songs[7].id} {songs[7].title} <br />
                <span className="artist">
                {songs[7].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv9}>
              {songs[8].id} {songs[8].title} <br />
                <span className="artist">
                {songs[8].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv10}>
              {songs[9].id} {songs[9].title} <br />
                <span className="artist">
                {songs[9].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv11}>
              {songs[10].id} {songs[10].title} <br />
                <span className="artist">
                {songs[10].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv12}>
              {songs[11].id} {songs[11].title} <br />
                <span className="artist">
                {songs[11].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv13}>
              {songs[12].id} {songs[12].title} <br />
                <span className="artist">
                {songs[12].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv14}>
              {songs[13].id} {songs[13].title} <br />
                <span className="artist">
                {songs[13].artist}
                </span>
              </div>
              <div className="item" onClick={handlediv15}>
              {songs[14].id} {songs[14].title} <br />
                <span className="artist">{songs[14].artist}</span>
              </div>
              <div className="item" onClick={handlediv16}>
              {songs[15].id} {songs[15].title} <br />
                <span className="artist">{songs[15].artist}</span>
              </div>
              <div className="item" onClick={handlediv17}>
              {songs[16].id} {songs[16].title} <br />
                <span className="artist">{songs[16].artist}</span>
              </div>
              <div className="item" onClick={handlediv18}>
              {songs[17].id} {songs[17].title} <br />
                <span className="artist">{songs[17].artist}</span>
              </div>
            </Scrollbars>
          </div>
        </div>
        <div className={!isPlaying?"curentsong":currentSongIndex>6&&currentSongIndex<=13?"curentsong1":currentSongIndex>13&&currentSongIndex<=14?"curentsong2":currentSongIndex>14&&currentSongIndex<=15?"curentsong3":currentSongIndex>15&&currentSongIndex<=16?"curentsong4":"curentsong"}>
          <img src={songs[currentSongIndex].img_src} alt="" />
          <div className="bg">
            <h1></h1>
          </div>
          <div className="song">
            <h1 className="playing">
              {songs[currentSongIndex].title} <br /> {songs[currentSongIndex].artist}
            </h1>
          </div>
        </div>
      </section>
      <section className="controls">
        <div className="music-controls">
          <input type="range" name="bar" id="bar" min="0" max="100" onChange={onPlaying} value={currentTime} onClick={checkwidth} ref={clickref} />
          <img id="btn-p" onClick={() => setIsPlaying(!isPlaying)}  src={isPlaying?pause:play} alt="" />
          <img id="btn-n" onClick={() => SkipSong()} src={next} alt="" />
          <img id="btn-pr" onClick={() => SkipSong(false)} src={previous} alt="" />
          <img id="btn-l" src={loop} alt="" />
          <img id="btn-v" src={volume} alt="" />
          <p id="start">{currentTime}</p>
          <p id="end">{duration}min</p>
        </div>
        <div className="vol-controls">
          <input type="range" />
        </div>
      </section>
      <audio src={songs[currentSongIndex].src} ref={audioEl} onTimeUpdate={onPlaying} ></audio>
    </>
  );
}

export default Home;

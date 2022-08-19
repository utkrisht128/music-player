import React from 'react'
import {Link} from "react-router-dom";
import "./Navbar.css"
import spotify from "./images/spotify.png";
function Navbar() {
  return (
    <>
    <section className='navbar'>
        <div className='logo'>
            
            <Link to="/"><img src={spotify} alt="Loading" />Spotify</Link>
        </div>
        <div className='search'>
            <input type="search" name="search" id="searchbar" placeholder='Search'/>
        </div>
    </section>
    </>
  )
}

export default Navbar
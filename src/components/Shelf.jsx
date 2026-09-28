import React from "react";
import { Link } from "react-router-dom";

/**
 * A titled row of cards. On desktop the cards wrap into a responsive grid; on
 * narrow screens the shelf becomes a horizontal snap-scroller so a phone shows
 * a browsable row instead of a single tall column of full-width cards.
 */
export default function Shelf({ title, subtitle, seeAllTo, children, scroll = true }) {
  return (
    <section className="shelf">
      <header className="shelf__head">
        <div>
          <h2 className="shelf__title">
            {seeAllTo ? <Link to={seeAllTo}>{title}</Link> : title}
          </h2>
          {subtitle ? <p className="shelf__subtitle">{subtitle}</p> : null}
        </div>
        {seeAllTo ? (
          <Link className="shelf__more" to={seeAllTo}>
            Show all
          </Link>
        ) : null}
      </header>
      <div className={scroll ? "shelf__grid shelf__grid--scroll" : "shelf__grid"}>{children}</div>
    </section>
  );
}

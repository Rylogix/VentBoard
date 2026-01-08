Reply name manual tests

- No name: submit a reply with the name field empty → stored as null, shows "Anonymous".
- Valid name: submit "Rylan" → stored and displayed as "Rylan".
- Trim: submit " Alex " → stored/displayed as "Alex".
- Empty after trim: submit "   " → treated as null, shows "Anonymous".
- Too long: submit 25+ characters → blocked with a validation error.
- Newline/tab: submit "Alex\nR" or "Alex\tR" → blocked with a validation error.

Replies UI checks

- View replies shows only the list; composer appears only after clicking Reply.
- Reply button moves under the loaded replies when the panel is open.
- Only one post has replies open at a time; opening another closes the previous.
- Reply list loads in batches (3–5); "See more" loads the next batch.
- New replies appear at the top; composer hides after sending.
- Long replies (60+ words) show inline "See more" to expand the full reply.

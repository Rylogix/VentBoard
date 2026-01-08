Reply name manual tests

- No name: submit a reply with the name field empty → stored as null, shows "Anonymous".
- Valid name: submit "Rylan" → stored and displayed as "Rylan".
- Trim: submit " Alex " → stored/displayed as "Alex".
- Empty after trim: submit "   " → treated as null, shows "Anonymous".
- Too long: submit 25+ characters → blocked with a validation error.
- Newline/tab: submit "Alex\nR" or "Alex\tR" → blocked with a validation error.

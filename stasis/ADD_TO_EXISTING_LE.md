# Add Stasis to an existing `le` repo without overwriting your other edits

The safest integration is:

1. Copy the entire `stasis/` folder into the root of your existing `le` repository.
2. Add one card to the root `index.html` inside `<nav class="projects">`:

```html
<a class="project" href="stasis/">
  <span class="number">04</span>
  <span class="icon stasis-icon" aria-hidden="true">◌</span>
  <strong>stasis</strong>
  <span>private little shared status rooms</span>
  <span class="open">see where we’re at →</span>
</a>
```

3. Add this to the root `style.css`:

```css
.stasis-icon { color: #a786d7; }
```

If you want a balanced 2×2 homepage grid with four projects, change:

```css
.projects { grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

to:

```css
.projects { grid-template-columns: repeat(2, minmax(0, 1fr)); }
```

4. Follow `stasis/SETUP.md` to connect Supabase.

This method does not touch your compliment inventory, rose files, or any other mini-site.

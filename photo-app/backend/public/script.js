document.getElementById("randomBtn").addEventListener("click", async () => {
  const res = await fetch("/random-photo");
  const data = await res.json();

  if (data.filename || data.url) {
    const imgUrl = data.url || `/photos/${data.filename}`;
    document.getElementById("photoContainer").innerHTML = `<img src="${imgUrl}" alt="Random Photo">`;
  } else {
    document.getElementById("photoContainer").innerText = "No photos available!";
  }
});

// Load one on first visit
(async () => {
  try {
    const res = await fetch('/random-photo');
    if (!res.ok) return;
    const data = await res.json();
    const imgUrl = data.url || `/photos/${data.filename}`;
    document.getElementById('photoContainer').innerHTML = `<img src="${imgUrl}" alt="Random Photo">`;
  } catch {}
})();


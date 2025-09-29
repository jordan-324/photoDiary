document.getElementById("randomBtn").addEventListener("click", async () => {
  const res = await fetch("http://localhost:3000/random-photo");
  const data = await res.json();

  if (data.filename) {
    const imgUrl = `http://localhost:3000/photos/${data.filename}`;
    document.getElementById("photoContainer").innerHTML = `<img src="${imgUrl}" alt="Random Photo">`;
  } else {
    document.getElementById("photoContainer").innerText = "No photos available!";
  }
});



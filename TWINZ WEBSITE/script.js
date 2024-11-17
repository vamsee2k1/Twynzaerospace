// Select modal elements
const modal = document.getElementById("bookingModal");
const bookNowBtn = document.getElementById("bookNowBtn");
const closeBtn = document.querySelector(".modal .close");

// Open the modal when "Book Now" is clicked
bookNowBtn.addEventListener("click", function(e) {
    e.preventDefault();
    modal.style.display = "block";
});

// Close the modal when the close button is clicked
closeBtn.addEventListener("click", function() {
    modal.style.display = "none";
});

// Close the modal if user clicks outside of it
window.addEventListener("click", function(event) {
    if (event.target === modal) {
        modal.style.display = "none";
    }
});

// Smooth scrolling for internal links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function(e) {
        e.preventDefault();
        const targetID = this.getAttribute("href");
        document.querySelector(targetID).scrollIntoView({
            behavior: "smooth"
        });
    });
});


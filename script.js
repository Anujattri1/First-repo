(() => {
  "use strict";
  
  const html = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isMobile = window.innerWidth <= 768 || isTouch;
  const lowPowerDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  const allowEffects = !reduceMotion && !lowPowerDevice;
  
  const rafThrottle = callback => {
    let ticking = false;
    return (...args) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        callback(...args);
        ticking = false;
      });
    };
  };

  // Preloader
  const preloader = document.getElementById("preloader");
  const hidePreloader = () => {
    if (!preloader || preloader.classList.contains("hidden")) return;
    preloader.classList.add("hidden");
    setTimeout(() => {
      preloader.style.display = "none";
    }, 320);
  };

  if (preloader) {
    window.addEventListener("load", hidePreloader, { once: true });
    setTimeout(hidePreloader, 900);
  }

  // Mobile Navigation
  const navToggle = document.querySelector(".nav-toggle");
  const mobileNav = document.querySelector(".mobile-nav");
  let scrollPosition = 0;

  const openMobileMenu = () => {
    if (!mobileNav || !navToggle) return;
    scrollPosition = window.scrollY;
    body.style.position = "fixed";
    body.style.top = `-${scrollPosition}px`;
    body.style.width = "100%";
    mobileNav.classList.add("open");
    navToggle.classList.add("active");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close menu");
  };

  const closeMobileMenu = () => {
    if (!mobileNav || !navToggle) return;
    mobileNav.classList.remove("open");
    navToggle.classList.remove("active");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
    body.style.position = "";
    body.style.top = "";
    body.style.width = "";
    window.scrollTo(0, scrollPosition);
  };

  if (navToggle) {
    navToggle.addEventListener("click", () => {
      if (mobileNav.classList.contains("open")) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });
  }

  mobileNav?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMobileMenu);
  });

  // Header Scroll Effect
  const header = document.getElementById("navbar");
  const handleHeaderScroll = () => {
    if (!header) return;
    if (window.scrollY > 50) {
      header.classList.add("header-active");
    } else {
      header.classList.remove("header-active");
    }
  };

  window.addEventListener("scroll", rafThrottle(handleHeaderScroll), { passive: true });
  handleHeaderScroll();

  // Scroll Progress Bar
  const progressBar = document.querySelector(".scroll-progress-bar");
  const handleScrollProgress = () => {
    if (!progressBar) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    progressBar.style.width = `${progress}%`;
  };

  window.addEventListener("scroll", rafThrottle(handleScrollProgress), { passive: true });
  handleScrollProgress();

  // Reveal on Scroll Animation
  const revealElements = document.querySelectorAll(".reveal");
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

  revealElements.forEach(el => revealObserver.observe(el));

  // Counter Animation
  const counters = document.querySelectorAll(".counter");
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => counterObserver.observe(counter));

  function animateCounter(element) {
    const target = parseInt(element.getAttribute("data-target"));
    const suffix = element.getAttribute("data-suffix") || "";
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    const stepDuration = duration / steps;
    let current = 0;

    const updateCounter = () => {
      current += increment;
      if (current < target) {
        element.textContent = Math.floor(current).toLocaleString() + suffix;
        setTimeout(updateCounter, stepDuration);
      } else {
        element.textContent = target.toLocaleString() + suffix;
      }
    };

    updateCounter();
  }

  // Smooth Scroll for Anchor Links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function(e) {
      const href = this.getAttribute("href");
      if (href !== "#" && href.length > 1) {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          const offsetTop = target.offsetTop - 80;
          window.scrollTo({ top: offsetTop, behavior: reduceMotion ? "auto" : "smooth" });
        }
      }
    });
  });

  // Particle Canvas Background
  const canvas = document.getElementById("particles");
  if (canvas && allowEffects && !isMobile) {
    const ctx = canvas.getContext("2d");
    let animationId;
    let particles = [];
    const particleCount = Math.min(80, Math.floor(window.innerWidth / 15));

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const makeParticle = () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2.5 + 0.5,
      speedX: Math.random() * 0.35 - 0.175,
      speedY: Math.random() * 0.35 - 0.175,
      color: Math.random() > 0.8 ? "rgba(61,214,208,.62)" : "rgba(255,120,0,.68)"
    });

    const resetParticles = () => {
      particles = Array.from({ length: particleCount }, makeParticle);
    };

    const animateParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(particle => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        if (particle.x < -10 || particle.x > canvas.width + 10 || particle.y < -10 || particle.y > canvas.height + 10) {
          Object.assign(particle, makeParticle());
        }
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
      });
      animationId = requestAnimationFrame(animateParticles);
    };

    resizeCanvas();
    resetParticles();
    animateParticles();

    window.addEventListener("resize", rafThrottle(() => {
      resizeCanvas();
      resetParticles();
    }), { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(animationId);
        return;
      }
      animateParticles();
    });
  }

  // Cursor Glow Effect (Desktop Only)
  const cursorGlow = document.querySelector(".cursor-glow");
  if (cursorGlow && !isTouch && allowEffects) {
    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;

    document.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursorGlow.style.opacity = "1";
    });

    const animateGlow = () => {
      glowX += (mouseX - glowX) * 0.1;
      glowY += (mouseY - glowY) * 0.1;
      cursorGlow.style.transform = `translate(${glowX}px, ${glowY}px) translate(-50%, -50%)`;
      requestAnimationFrame(animateGlow);
    };

    animateGlow();

    document.addEventListener("mouseleave", () => {
      cursorGlow.style.opacity = "0";
    });
  }

  // Keyboard Navigation for Accessibility
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileNav?.classList.contains("open")) {
      closeMobileMenu();
    }
  });

})();

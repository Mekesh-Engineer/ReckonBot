"use strict";

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const initStickyNav = () => {
  const stickyNav = document.getElementById('stickyNav');
  if (!stickyNav) return;

  let lastKnownScroll = 0;
  let ticking = false;

  const update = () => {
    const currentScroll = lastKnownScroll;
    if (currentScroll > 300) {
      stickyNav.classList.add('visible');
      stickyNav.classList.toggle('scrolled', currentScroll > 400);
    } else {
      stickyNav.classList.remove('visible', 'scrolled');
    }
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    lastKnownScroll = window.scrollY;
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
};

const initReveal = () => {
  if (prefersReducedMotion) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('active'));
    return;
  }

  const revealElements = document.querySelectorAll('.reveal');
  if (!revealElements.length) return;

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach((el) => revealObserver.observe(el));
};

const initCarousel = () => {
  const track = document.getElementById('testimonialTrack');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (!track || !prevBtn || !nextBtn) return;

  const testimonials = track.children;
  let currentTestimonial = 0;
  let autoSlideInterval;

  const showTestimonial = (index) => {
    track.style.transform = `translateX(-${index * 100}%)`;
  };

  const next = () => {
    currentTestimonial = (currentTestimonial + 1) % testimonials.length;
    showTestimonial(currentTestimonial);
  };

  const prev = () => {
    currentTestimonial = (currentTestimonial - 1 + testimonials.length) % testimonials.length;
    showTestimonial(currentTestimonial);
  };

  const startAutoSlide = () => {
    if (prefersReducedMotion) return;
    stopAutoSlide();
    autoSlideInterval = setInterval(next, 5000);
  };

  const stopAutoSlide = () => {
    if (autoSlideInterval) clearInterval(autoSlideInterval);
  };

  nextBtn.addEventListener('click', () => {
    next();
    startAutoSlide();
  });

  prevBtn.addEventListener('click', () => {
    prev();
    startAutoSlide();
  });

  [prevBtn, nextBtn].forEach((button) => {
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        button.click();
      }
    });
  });

  startAutoSlide();
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoSlide();
    else startAutoSlide();
  });
};

const initForm = () => {
  const contactForm = document.getElementById('contactForm');
  if (!contactForm) return;

  const formStatus = document.getElementById('formStatus');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formStatus) {
      formStatus.textContent = 'Sending...';
      formStatus.style.color = 'var(--text-color)';
      formStatus.hidden = false;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (formStatus) {
        formStatus.textContent = 'Inquiry sent successfully!';
        formStatus.style.color = 'var(--success)';
      }
      contactForm.reset();
    } catch (error) {
      console.error('Form submission error:', error);
      if (formStatus) {
        formStatus.textContent = 'Error sending inquiry. Please try again.';
        formStatus.style.color = 'var(--error)';
      }
    } finally {
      if (formStatus) {
        setTimeout(() => {
          formStatus.hidden = true;
        }, 5000);
      }
    }
  });
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 4000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const initFirmwareStatus = async () => {
  const statusEl = document.getElementById('firmwareStatus');
  if (!statusEl) return;

  const endpoint = statusEl.dataset.endpoint?.trim();
  if (!endpoint) {
    statusEl.textContent = 'Firmware status: endpoint not configured';
    statusEl.dataset.status = 'warn';
    return;
  }

  try {
    const response = await fetchWithTimeout(`${endpoint.replace(/\/$/, '')}/health`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const status = payload.status || 'ok';
    statusEl.textContent = `Firmware status: ${status}`;
    statusEl.dataset.status = status === 'ok' ? 'ok' : 'warn';
  } catch (error) {
    console.warn('Firmware status unavailable:', error);
    statusEl.textContent = 'Firmware status: offline';
    statusEl.dataset.status = 'error';
  }
};

const initLanding = () => {
  initStickyNav();
  initReveal();
  initCarousel();
  initForm();
  initFirmwareStatus();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanding, { once: true });
} else {
  initLanding();
}

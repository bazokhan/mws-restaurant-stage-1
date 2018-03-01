let restaurants,
  neighborhoods,
  cuisines;
var map;
var markers = [];

/**
 * - Fetch neighborhoods and cuisines as soon as the page is loaded.
 * - Add eventListeners for neighborhoods and cuisines filters.
 * - Display a list of all restaurants on the page.
 * - Register serviceWorker.
 */
document.addEventListener('DOMContentLoaded', (event) => {
  fetchNeighborhoods();
  fetchCuisines();
  document.getElementById('neighborhoods-select').addEventListener('change', updateRestaurants);
  document.getElementById('cuisines-select').addEventListener('change', updateRestaurants);
  updateRestaurants();
  new ServiceWorker('/sw.js').register();
});

/**
 * Service Worker
 */
class ServiceWorker {
  constructor(url) {
    this.url = url;
    this.worker = null;
    // DOM reference
    this.container = document.getElementById('dialog-container');
    this.confirmButton = document.getElementById('dialog-confirm');
    this.cancelButton = document.getElementById('dialog-cancel');
    this.focusBeforeDialog = null;
    // Event Listeners
    this._confirmUpdate = this._confirmUpdate.bind(this);
    this._cancelUpdate = this._cancelUpdate.bind(this);
    this._handleKeyboardEvents = this._handleKeyboardEvents.bind(this);
  }

  register() {
    if (!navigator || !navigator.serviceWorker) return;
    navigator.serviceWorker.register(this.url)
      .then(reg => {
        /**
         * Listen for serviceWorker updates and
         * show a dialog to prompt user for update
         */
        if (!navigator.serviceWorker.controller) return; // This SW is the only one.
        if (reg.waiting) {
          this.worker = reg.waiting;
          this._showDialog();
          return;
        }
        if (reg.installing) {
          this.worker = reg.installing;
          this._trackWorker();
          return;
        }
        reg.addEventListener('updatefound', (event) => {
          this.worker = reg.installing;
          this._trackWorker();
        });
      })
  }

  _trackWorker() {
    this.worker.addEventListener('statechange', (event) => {
      if (this.worker.state === 'installed') {
        this._showDialog();
      }
    });
  }

  _showDialog() {
    this.container.classList.add('show-dialog');
    // Add click events
    this.confirmButton.addEventListener('click', this._confirmUpdate);
    this.cancelButton.addEventListener('click', this._cancelUpdate);
    // Change focus
    this.focusBeforeDialog = document.activeElement;
    this.confirmButton.focus();
    // Add keyboard events
    window.addEventListener('keydown', this._handleKeyboardEvents);
  }

  _hideDialog() {
    this.container.classList.remove('show-dialog');
    // Remove click events
    this.confirmButton.removeEventListener('click', this._confirmUpdate);
    this.cancelButton.removeEventListener('click', this._cancelUpdate);
    // Restore focus
    if (this.focusBeforeDialog) {
      this.focusBeforeDialog.focus();
    } else {
      document.querySelector('a').focus();
    }
    // Remove keyboard events
    window.removeEventListener('keydown', this._handleKeyboardEvents);
  }

  _confirmUpdate() {
    this.worker.postMessage({action: 'skipWaiting'});
    navigator.serviceWorker.addEventListener('controllerchange', (event) => {
      window.location.reload();
    })
    this._hideDialog();
  }

  _cancelUpdate() {
    this._hideDialog();
  }

  _handleKeyboardEvents(event) {
    if (event.code === 'Escape') {
      event.preventDefault();
      this._hideDialog();
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      if (document.activeElement === this.confirmButton) {
        this.cancelButton.focus();
      } else {
        this.confirmButton.focus();
      }
    }
  }
}

/**
 * Fetch all neighborhoods and set their HTML.
 */
fetchNeighborhoods = () => {
  DBHelper.fetchNeighborhoods((error, neighborhoods) => {
    if (error) { // Got an error
      console.error(error);
    } else {
      self.neighborhoods = neighborhoods;
      fillNeighborhoodsHTML();
    }
  });
}

/**
 * Set neighborhoods HTML.
 */
fillNeighborhoodsHTML = (neighborhoods = self.neighborhoods) => {
  const select = document.getElementById('neighborhoods-select');
  neighborhoods.forEach(neighborhood => {
    const option = document.createElement('option');
    option.innerHTML = neighborhood;
    option.value = neighborhood;
    select.append(option);
  });
}

/**
 * Fetch all cuisines and set their HTML.
 */
fetchCuisines = () => {
  DBHelper.fetchCuisines((error, cuisines) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.cuisines = cuisines;
      fillCuisinesHTML();
    }
  });
}

/**
 * Set cuisines HTML.
 */
fillCuisinesHTML = (cuisines = self.cuisines) => {
  const select = document.getElementById('cuisines-select');

  cuisines.forEach(cuisine => {
    const option = document.createElement('option');
    option.innerHTML = cuisine;
    option.value = cuisine;
    select.append(option);
  });
}

/**
 * Initialize Google map.
 */

window.initMap = () => {
    let loc = {
      lat: 40.722216,
      lng: -73.987501
    };
      self.map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: loc,
        scrollwheel: false
      });
    updateRestaurants();
}


/**
 * Update page and map for current restaurants.
 */
updateRestaurants = () => {
  const cSelect = document.getElementById('cuisines-select');
  const nSelect = document.getElementById('neighborhoods-select');

  const cIndex = cSelect.selectedIndex;
  const nIndex = nSelect.selectedIndex;

  const cuisine = cSelect[cIndex].value;
  const neighborhood = nSelect[nIndex].value;

  DBHelper.fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, (error, restaurants) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      if (google && google.maps) { // Google maps API can be reached
        resetRestaurants(restaurants);
        resetRestaurantsMap();
        resetRestaurantsHTML();
        fillRestaurantsHTML();
        addMarkersToMap();
      } else {                    // Offline
        resetRestaurants(restaurants);
        resetRestaurantsHTML();
        fillRestaurantsHTML();
      }
    }
  })
}

/**
 * Clear current restaurants, their HTML and remove their map markers.
 */
resetRestaurants = (restaurants = []) => {
  // Set old restaurants array to a new array or empty array
  self.restaurants = restaurants;
}

resetRestaurantsHTML = () => {
  // Remove all restaurants list items
  const ul = document.getElementById('restaurants-list');
  ul.innerHTML = '';
}

resetRestaurantsMap = () => {
  // Remove all map markers
  self.markers.forEach(m => m.setMap(null));
  self.markers = [];
}

/**
 * Create all restaurants HTML and add them to the webpage.
 */
fillRestaurantsHTML = (restaurants = self.restaurants) => {
  const ul = document.getElementById('restaurants-list');
  restaurants.forEach(restaurant => {
    ul.append(createRestaurantHTML(restaurant));
  });
}

/**
 * Create restaurant image and lazy load it.
 */
createRestaurantImage = (restaurant) => {
  const image = document.createElement('img');
  const imageName = DBHelper.imageUrlForRestaurant(restaurant);
  image.className = 'restaurant-img';
  image.id = imageName;
  image.src = '/icon/placeholder.jpg'
  image.setAttribute('alt', restaurant.name + ' Restaurant');

  // Get srcset: Images are generated at sizes: 400w, 600w, 800w
  const imageS = imageName.replace(/\./, '-400.'); // Small image
  const imageM = imageName.replace(/\./, '-600.'); // Medium image
  const imageL = imageName.replace(/\./, '-800.'); // Large image
  const imageSrcset = imageS + ' 400w, ' + imageM + ' 600w, ' + imageL + ' 800w';

  // Add attributes: data-src, data-srcset
  image.setAttribute('data-src', imageS);
  image.setAttribute('data-srcset', imageSrcset);

  // Add Sizes attribute: Image width changes at breakpoints min-600px, min-960px
  image.setAttribute('sizes', '(min-width: 960px) 33.33vw, (min-width: 600px) 50vw, 100vw');

  return image;
}

lazyLoad = (entries, observer = imagesObserver) => {
  entries.forEach(entry => {
    const image = entry.target;
    const imageSrc = image.getAttribute('data-src');
    const imageSrcSet = image.getAttribute('data-srcset');
    // console.log(entry);
    if (entry.isIntersecting) {
      image.src = imageSrc;
      image.setAttribute('srcset', imageSrcSet);
      observer.unobserve(image);
    }
  });
};

const imagesObserver = new IntersectionObserver(lazyLoad, {threshold: 0.2});

/**
 * Create restaurant HTML.
 */
createRestaurantHTML = (restaurant) => {
  // Create list item for the restaurant
  const li = document.createElement('li');

  // Create restaurant image and add it to the list item
  const image = createRestaurantImage(restaurant);
  li.append(image);

  imagesObserver.observe(image);

  // Create a heading for restaurant name and add it to the restaurant list item
  const name = document.createElement('h2');
  name.innerHTML = restaurant.name;
  li.append(name);

  // Create a paragraph for restaurant neighborhood and add it to the restaurant list item
  const neighborhood = document.createElement('p');
  neighborhood.innerHTML = restaurant.neighborhood;
  li.append(neighborhood);

  // Create a paragraph for restaurant address and add it to the restaurant list item
  const address = document.createElement('p');
  address.innerHTML = restaurant.address;
  li.append(address);

  // Create a link to the restaurant's details page and add it to the restaurant list item
  const more = document.createElement('a');
  more.innerHTML = 'View Details';
  more.href = DBHelper.urlForRestaurant(restaurant);
  more.setAttribute('aria-label','View details of ' + restaurant.name + ' restaurant');
  li.append(more);

  return li;
}

/**
 * Add markers for current restaurants to the map.
 */
addMarkersToMap = (restaurants = self.restaurants) => {
  restaurants.forEach(restaurant => {
    // Add marker to the map
    const marker = DBHelper.mapMarkerForRestaurant(restaurant, self.map);
    google.maps.event.addListener(marker, 'click', () => {
      window.location.href = marker.url
    });
    self.markers.push(marker);
  });
}

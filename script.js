document.addEventListener('DOMContentLoaded', function() {
  // Variables globales
  let currentPage = 1;
  let currentLimit = 10;
  let currentSearch = '';
  let editingId = null;
  
  // Elementos del DOM
  const booksTable = document.getElementById('books-table');
  const paginationInfo = document.getElementById('pagination-info');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const searchInput = document.getElementById('search-input');
  const limitSelect = document.getElementById('limit-select');
  const addBookBtn = document.getElementById('add-book-btn');
  const bookModal = document.getElementById('book-modal');
  const bookForm = document.getElementById('book-form');
  const modalTitle = document.getElementById('modal-title');
  const cancelBtn = document.getElementById('cancel-btn');
  
  // Carrusel
  const carousel = document.querySelector('.carousel');
  const carouselItems = document.querySelectorAll('.carousel-item');
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');
  let currentSlide = 0;
  
  // Inicializar la aplicación
  init();
  
  function init() {
    loadBooks();
    setupEventListeners();
    startCarousel();
  }
  
  function setupEventListeners() {
    // Navegación de páginas
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadBooks();
      }
    });
    
    nextPageBtn.addEventListener('click', () => {
      currentPage++;
      loadBooks();
    });
    
    // Búsqueda
    searchInput.addEventListener('input', debounce(() => {
      currentSearch = searchInput.value;
      currentPage = 1;
      loadBooks();
    }, 500));
    
    // Cambiar límite de registros
    limitSelect.addEventListener('change', () => {
      currentLimit = parseInt(limitSelect.value);
      currentPage = 1;
      loadBooks();
    });
    
    // Modal para agregar/editar libros
    addBookBtn.addEventListener('click', () => openModal());
    cancelBtn.addEventListener('click', () => closeModal());
    
    // Cerrar modal al hacer clic fuera
    bookModal.addEventListener('click', (e) => {
      if (e.target === bookModal) {
        closeModal();
      }
    });
    
    // Enviar formulario
    bookForm.addEventListener('submit', handleFormSubmit);
    
    // Carrusel
    prevBtn.addEventListener('click', () => navigateCarousel(-1));
    nextBtn.addEventListener('click', () => navigateCarousel(1));
  }
  
  // Cargar libros desde la API
  function loadBooks() {
    const params = new URLSearchParams({
      page: currentPage,
      limit: currentLimit,
      search: currentSearch
    });
    
    fetch(`/api/libros?${params}`)
      .then(response => response.json())
      .then(data => {
        renderBooks(data.libros);
        updatePagination(data);
      })
      .catch(error => {
        console.error('Error al cargar libros:', error);
        alert('Error al cargar los libros. Por favor, intente nuevamente.');
      });
  }
  
  // Renderizar libros en la tabla
  function renderBooks(books) {
    const tbody = booksTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (books.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center;">No se encontraron libros</td>`;
      tbody.appendChild(tr);
      return;
    }
    
    books.forEach(book => {
      const tr = document.createElement('tr');
      
      const leerLink = book.archivo_pdf 
        ? `<a href="/pdf/${book.id}" target="_blank" class="btn btn-read">
             <i class="fas fa-book-reader"></i> Leer PDF
           </a>`
        : '<span class="no-pdf">No disponible</span>';
      
      tr.innerHTML = `
        <td>${book.titulo}</td>
        <td>${book.autor}</td>
        <td>${book.año}</td>
        <td>${book.genero}</td>
        <td>${book.idioma || 'No especificado'}</td>
        <td>${leerLink}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-edit" data-id="${book.id}">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-delete" data-id="${book.id}">
              <i class="fas fa-trash"></i> Eliminar
            </button>
          </div>
        </td>
      `;
      
      tbody.appendChild(tr);
    });
    
    // Agregar event listeners a los botones de acción
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        editBook(id);
      });
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        deleteBook(id);
      });
    });
  }
  
  // Actualizar información de paginación
  function updatePagination(data) {
    paginationInfo.textContent = `Página ${data.page} de ${data.totalPages}`;
    
    prevPageBtn.disabled = data.page <= 1;
    nextPageBtn.disabled = data.page >= data.totalPages;
  }
  
  // Abrir modal para agregar/editar libro
  function openModal(book = null) {
    if (book) {
      modalTitle.textContent = 'Editar Libro';
      document.getElementById('titulo').value = book.titulo;
      document.getElementById('autor').value = book.autor;
      document.getElementById('año').value = book.año;
      document.getElementById('genero').value = book.genero;
      document.getElementById('idioma').value = book.idioma || '';
      editingId = book.id;
    } else {
      modalTitle.textContent = 'Agregar Nuevo Libro';
      bookForm.reset();
      editingId = null;
    }
    
    bookModal.style.display = 'flex';
  }
  
  // Cerrar modal
  function closeModal() {
    bookModal.style.display = 'none';
    bookForm.reset();
    editingId = null;
  }
  
  // Manejar envío del formulario
  function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(bookForm);
    
    // Si estamos editando, usar PUT, de lo contrario POST
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/libros/${editingId}` : '/api/libros';
    
    fetch(url, {
      method: method,
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      closeModal();
      loadBooks();
      alert(editingId ? 'Libro actualizado correctamente' : 'Libro agregado correctamente');
    })
    .catch(error => {
      console.error('Error al guardar libro:', error);
      alert('Error al guardar el libro. Por favor, intente nuevamente.');
    });
  }
  
  // Editar libro
  function editBook(id) {
    fetch(`/api/libros/${id}`)
      .then(response => response.json())
      .then(book => {
        openModal(book);
      })
      .catch(error => {
        console.error('Error al cargar libro:', error);
        alert('Error al cargar el libro. Por favor, intente nuevamente.');
      });
  }
  
  // Eliminar libro
  function deleteBook(id) {
    if (confirm('¿Está seguro de que desea eliminar este libro? Esta acción también eliminará el archivo PDF asociado.')) {
      fetch(`/api/libros/${id}`, {
        method: 'DELETE'
      })
      .then(response => response.json())
      .then(data => {
        if (data.deleted > 0) {
          alert('Libro eliminado correctamente');
          loadBooks();
        } else {
          alert('Error al eliminar el libro');
        }
      })
      .catch(error => {
        console.error('Error al eliminar libro:', error);
        alert('Error al eliminar el libro. Por favor, intente nuevamente.');
      });
    }
  }
  
  // Funcionalidad del carrusel
  function startCarousel() {
    // Auto-avance cada 5 segundos
    setInterval(() => {
      navigateCarousel(1);
    }, 5000);
  }
  
  function navigateCarousel(direction) {
    currentSlide += direction;
    
    if (currentSlide < 0) {
      currentSlide = carouselItems.length - 1;
    } else if (currentSlide >= carouselItems.length) {
      currentSlide = 0;
    }
    
    carousel.style.transform = `translateX(-${currentSlide * 100}%)`;
  }
  
  // Utilidad para debounce
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
});
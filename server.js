const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Uso de memoria temporal para archivos en Render
const storage = multer.memoryStorage(); // Almacena en memoria en lugar de disco

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // Límite de 10MB
  }
});

// Middleware
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas específicas para archivos estáticos 
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.js'));
});

// Inicializar base de datos
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/library.db'  
  : './library.db';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos', err);
  } else {
    console.log('Conectado a la base de datos SQLite en:', dbPath);
    db.run(`CREATE TABLE IF NOT EXISTS libros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      autor TEXT NOT NULL,
      año INTEGER,
      genero TEXT,
      idioma TEXT,
      archivo_pdf TEXT,
      pdf_data BLOB 
    )`);
  } // Archivar PDF en Base de Datos
});

// Ruta para servir PDFs desde la base de datos
app.get('/pdf/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT pdf_data FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row || !row.pdf_data) {
      return res.status(404).send('PDF no encontrado');
    }
    
    // Configurar headers para PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    
    // Enviar el PDF almacenado en la base de datos
    res.send(row.pdf_data);
  });
});

// API Routes 
app.get('/api/libros', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT id, titulo, autor, año, genero, idioma, archivo_pdf FROM libros';
  let countQuery = 'SELECT COUNT(*) as total FROM libros';
  let params = [];

  if (search) {
    query += ' WHERE titulo LIKE ? OR autor LIKE ? OR genero LIKE ? OR idioma LIKE ?';
    countQuery += ' WHERE titulo LIKE ? OR autor LIKE ? OR genero LIKE ? OR idioma LIKE ?';
    params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
  }

  query += ' LIMIT ? OFFSET ?';
  
  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.all(query, [...params, limit, offset], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        libros: rows,
        total: countResult.total,
        page,
        limit,
        totalPages: Math.ceil(countResult.total / limit)
      });
    });
  });
});

// Obtener un libro por ID
app.get('/api/libros/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT id, titulo, autor, año, genero, idioma, archivo_pdf FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }
    
    res.json(row);
  });
});

// Agregar un nuevo libro
app.post('/api/libros', upload.single('archivo_pdf'), (req, res) => {
  const { titulo, autor, año, genero, idioma } = req.body;
  
  // Limpiar nombre de archivo (eliminar espacios)
  const archivo_pdf = req.file ? req.file.originalname.replace(/\s+/g, '_') : null;
  const pdf_data = req.file ? req.file.buffer : null; // Almacenar el buffer del archivo

  db.run(
    'INSERT INTO libros (titulo, autor, año, genero, idioma, archivo_pdf, pdf_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [titulo, autor, año, genero, idioma, archivo_pdf, pdf_data],
    function(err) {
      if (err) {
        console.error('Error al insertar libro:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    }
  );
});

// Actualizar un libro 
app.put('/api/libros/:id', upload.single('archivo_pdf'), (req, res) => {
  const { id } = req.params;
  const { titulo, autor, año, genero, idioma } = req.body;
  
  // Limpiar nombre de archivo
  const archivo_pdf = req.file ? req.file.originalname.replace(/\s+/g, '_') : null;
  const pdf_data = req.file ? req.file.buffer : null;

  let query = 'UPDATE libros SET titulo = ?, autor = ?, año = ?, genero = ?, idioma = ?';
  let params = [titulo, autor, año, genero, idioma];

  if (archivo_pdf && pdf_data) {
    query += ', archivo_pdf = ?, pdf_data = ?';
    params.push(archivo_pdf, pdf_data);
  }

  query += ' WHERE id = ?';
  params.push(id);

  db.run(query, params, function(err) {
    if (err) {
      console.error('Error al actualizar libro:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ changes: this.changes });
  });
});

// Eliminar un libro
app.delete('/api/libros/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM libros WHERE id = ?', id, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ deleted: this.changes });
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Manejo de errores
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo es demasiado grande. Máximo 10MB.' });
    }
  }
  res.status(400).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Base de datos: ${dbPath}`);
});
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de multer para memoria
const storage = multer.memoryStorage();

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
    fileSize: 10 * 1024 * 1024 // 10MB
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
      archivo_nombre TEXT,
      pdf_data BLOB,
      pdf_tipo TEXT
    )`);
  }
});

// Ruta para descargar PDF desde la base de datos
app.get('/descargar-pdf/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT archivo_nombre, pdf_data, pdf_tipo FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error al obtener PDF:', err);
      return res.status(500).send('Error del servidor');
    }
    
    if (!row || !row.pdf_data) {
      return res.status(404).send('PDF no encontrado');
    }
    
    // Configurar headers para descarga de PDF
    res.setHeader('Content-Type', row.pdf_tipo || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${row.archivo_nombre || 'documento.pdf'}"`);
    res.setHeader('Content-Length', row.pdf_data.length);
    
    // Enviar el PDF
    res.send(row.pdf_data);
  });
});

// Ruta para ver en PDF en el navegador
app.get('/ver-pdf/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT archivo_nombre, pdf_data, pdf_tipo FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error al obtener PDF:', err);
      return res.status(500).send('Error del servidor');
    }
    
    if (!row || !row.pdf_data) {
      return res.status(404).send('PDF no encontrado');
    }
    
    // Configurar headers para visualización en el navegador
    res.setHeader('Content-Type', row.pdf_tipo || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${row.archivo_nombre || 'documento.pdf'}"`);
    res.setHeader('Content-Length', row.pdf_data.length);
    
    // Enviar el PDF
    res.send(row.pdf_data);
  });
});

// API Routes
app.get('/api/libros', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT id, titulo, autor, año, genero, idioma, archivo_nombre FROM libros';
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
  
  db.get('SELECT id, titulo, autor, año, genero, idioma, archivo_nombre FROM libros WHERE id = ?', [id], (err, row) => {
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
  
  let archivo_nombre = null;
  let pdf_data = null;
  let pdf_tipo = null;

  if (req.file) {
    archivo_nombre = req.file.originalname;
    pdf_data = req.file.buffer; // Buffer del archivo
    pdf_tipo = req.file.mimetype;
  }

  db.run(
    'INSERT INTO libros (titulo, autor, año, genero, idioma, archivo_nombre, pdf_data, pdf_tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [titulo, autor, año, genero, idioma, archivo_nombre, pdf_data, pdf_tipo],
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
  
  // Obtenención del libro actual
  db.get('SELECT * FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    let archivo_nombre = row.archivo_nombre;
    let pdf_data = row.pdf_data;
    let pdf_tipo = row.pdf_tipo;

    // Si se subió un nuevo archivo, actualizar
    if (req.file) {
      archivo_nombre = req.file.originalname;
      pdf_data = req.file.buffer;
      pdf_tipo = req.file.mimetype;
    }

    const query = 'UPDATE libros SET titulo = ?, autor = ?, año = ?, genero = ?, idioma = ?, archivo_nombre = ?, pdf_data = ?, pdf_tipo = ? WHERE id = ?';
    const params = [titulo, autor, año, genero, idioma, archivo_nombre, pdf_data, pdf_tipo, id];

    db.run(query, params, function(err) {
      if (err) {
        console.error('Error al actualizar libro:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ changes: this.changes });
    });
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
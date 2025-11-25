const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Asegurar que la carpeta uploads exista
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de multer para subir archivos PDF
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Nombre único para evitar conflictos
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

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
app.use('/uploads', express.static(uploadsDir)); // Servir archivos subidos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar base de datos
const db = new sqlite3.Database('./library.db', (err) => {
  if (err) {
    console.error('Error al abrir la base de datos', err);
  } else {
    console.log('Conectado a la base de datos SQLite.');
    db.run(`CREATE TABLE IF NOT EXISTS libros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      autor TEXT NOT NULL,
      año INTEGER,
      genero TEXT,
      idioma TEXT,
      archivo_pdf TEXT
    )`);
  }
});

// Ruta para servir el archivo CSS correctamente
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

// Ruta para servir el archivo JS correctamente
app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.js'));
});

// API Routes
app.get('/api/libros', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT * FROM libros';
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
  
  db.get('SELECT * FROM libros WHERE id = ?', [id], (err, row) => {
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
  const archivo_pdf = req.file ? req.file.filename : null;

  db.run(
    'INSERT INTO libros (titulo, autor, año, genero, idioma, archivo_pdf) VALUES (?, ?, ?, ?, ?, ?)',
    [titulo, autor, año, genero, idioma, archivo_pdf],
    function(err) {
      if (err) {
        // Si hay error, eliminar el archivo subido
        if (req.file) {
          fs.unlinkSync(path.join(uploadsDir, req.file.filename));
        }
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
  const archivo_pdf = req.file ? req.file.filename : null;

  // Obtener el libro actual para eliminar el archivo viejo si es necesario
  db.get('SELECT archivo_pdf FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    let query = 'UPDATE libros SET titulo = ?, autor = ?, año = ?, genero = ?, idioma = ?';
    let params = [titulo, autor, año, genero, idioma];

    if (archivo_pdf) {
      query += ', archivo_pdf = ?';
      params.push(archivo_pdf);
    }

    query += ' WHERE id = ?';
    params.push(id);

    db.run(query, params, function(err) {
      if (err) {
        // Si hay error, eliminar el archivo nuevo subido
        if (req.file) {
          fs.unlinkSync(path.join(uploadsDir, req.file.filename));
        }
        return res.status(500).json({ error: err.message });
      }
      
      // Eliminar el archivo viejo si se subió uno nuevo
      if (archivo_pdf && row && row.archivo_pdf) {
        const oldFilePath = path.join(uploadsDir, row.archivo_pdf);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      
      res.json({ changes: this.changes });
    });
  });
});

// Eliminar un libro - TAMBIÉN ELIMINA EL ARCHIVO PDF
app.delete('/api/libros/:id', (req, res) => {
  const { id } = req.params;
  
  // Obtener información del libro para eliminar el archivo
  db.get('SELECT archivo_pdf FROM libros WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Eliminar el archivo PDF si existe
    if (row && row.archivo_pdf) {
      const filePath = path.join(uploadsDir, row.archivo_pdf);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Eliminar el registro de la base de datos
    db.run('DELETE FROM libros WHERE id = ?', id, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ deleted: this.changes });
    });
  });
});

// Servir la página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Manejo de errores de multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo es demasiado grande. Máximo 10MB.' });
    }
  }
  res.status(400).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`Carpeta de uploads: ${uploadsDir}`);
});
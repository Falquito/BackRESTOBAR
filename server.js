// const express = require("express");
// const cors = require("cors");
// const multer = require('multer')
// const mercadopago = require("mercadopago");
// const mysql = require('mysql2/promise.js')
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import mercadopago from 'mercadopago'
import mysql from 'mysql2/promise'
import { Server } from 'socket.io'
import {createServer} from 'node:http'

const PORT = process.env.PORT ?? 8080


//CONEXION A MYSQL
//creo la conexion
// const connection = await mysql.createConnection({
// 	host:'localhost',
//     user:'root',
//     port:3306,
//     password:'',
//     database:'Tienda'
// })
const connection = await mysql.createConnection({
	host:'b7qwgzvtz0fa38vofcff-mysql.services.clever-cloud.com',
    user:'ur2tnqnbnxxnl2fx',
    port:3306,
    password:'crOXAmX7fsAf6FOo1nIu',
    database:'b7qwgzvtz0fa38vofcff'
})
const app = express();


// REPLACE WITH YOUR ACCESS TOKEN AVAILABLE IN: https://developers.mercadopago.com/panel
mercadopago.configure({
	access_token: "TEST-134490222946493-091622-c58e593e08cb5d6efa000a282692fe4a-1022549395",
});

//CONFIGURACION DE MULTER PARA MANEJO DE ARCHIVOS
const storage = multer.memoryStorage();
const upload = multer({storage:storage});



app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("../../client/html-js"));
app.use(cors({
	origin:'http://localhost:5173',
	methods:['GET','POST','PATCH','PUT','DELETE']
}));
const server = createServer(app)
const io = new Server(server,{
	cors:{
		origin:'http://localhost:5173',
		methods:['GET','POST','PATCH'],
	}
})
io.on('connection',(socket)=>{
	console.log("se conecto un usuario desde react")
	socket.on('ordenCreada',async ()=>{
		console.log('se registro una orden')
		const [ordenes_con_detalle] = await connection.query(`SELECT 
			o.id_orden,
			o.recibido,
			o.nro_mesa,
			o.fecha_orden,
			o.total_orden,
			mp.nombre AS metodo_de_pago,
			CONCAT('[', GROUP_CONCAT(
				CONCAT('["', pXo.nombre_producto, '","' '","', p.precio, '"]')
			SEPARATOR ','), ']') AS productos_de_la_orden
		FROM ordenes o
		JOIN metodos_de_pago mp ON o.id_mp = mp.id_mp
		JOIN productoXorden pXo ON o.id_orden = pXo.id_orden
		JOIN productos p ON pXo.id_producto = p.id_prod
		GROUP BY o.id_orden, o.fecha_orden, o.total_orden, mp.nombre;`)
		io.emit('ordenesEnviar',ordenes_con_detalle)
	})
	socket.on('ordenMixtaCreada',async ()=>{
		console.log('se registro una orden mixta')
		const [ordenesMixtas_con_detalle] = await connection.query(`SELECT 
			o.id_orden,
			o.recibido,
			o.nro_mesa,
			o.fecha_orden,
			o.pagadoMP,
			o.pagadoEfectivo,
			CONCAT('[', GROUP_CONCAT(
				CONCAT('["', pXo.nombre_producto, '","' '","', p.precio, '"]')
			SEPARATOR ','), ']') AS productos_de_la_orden
		FROM ordenes_mixtas o
		JOIN productoXordenesMixtas pXo ON o.id_orden = pXo.id_ordenMixta
		JOIN productos p ON pXo.id_producto = p.id_prod
		GROUP BY o.id_orden, o.fecha_orden, o.pagadoMP,o.pagadoEfectivo;
`)
		io.emit('ordenesMixtasEnviar',ordenesMixtas_con_detalle)
	})
})

app.post("/create_preference", (req, res) => {
	console.log(req.body)
	const data=[]
	req.body.forEach((product)=>{
		data.push({
			title:product.description,
			unit_price:Number(product.price),
			quantity:Number(product.quantity)
		})
	})
	let preference = {
		items: data
			
			// {
			// 	title: req.body[0].description,
			// 	unit_price: Number(req.body[0].price),
			// 	quantity: Number(req.body[0].quantity),
			// },
			// {
			// 	title: req.body[1].description,
			// 	unit_price: Number(req.body[1].price),
			// 	quantity: Number(req.body[1].quantity),
			// }
		,
		back_urls: {
			"success": "http://localhost:5173/success",
			"failure": "http://localhost:5173",
			"pending": "http://localhost:5173"
		},
		auto_return: "approved",
	};

	mercadopago.preferences.create(preference)
		.then(function (response) {
			console.log(response.payment_id)
			res.json({
				id: response.body.id
			});
		}).catch(function (error) {
			console.log(error);
		});
});

app.get('/success', function (req, res) {
	res.json({
		Status: req.query.status,
	});
});
//seccion para traer CATEGORIAS
app.get('/traercategoria',async (req,res)=>{
	try {
		const [categorias] = await connection.query(`SELECT nombre FROM categorias`)
		if(categorias) res.json(categorias)
		else res.status(500).json({message:'Error al obtener categorias'})
	} catch (error) {
		res.status(500).send(error)
	}
})

// Seccion para crear,traer PRODUCTOS
app.post('/crearProducto',upload.single('image'),async(req,res)=>{
	try {
		console.log(req.file)
		const imagen = req.file.buffer; //la imagen esta en formato buffer
		const [id_categoria] = await connection.query(`SELECT id_categoria FROM categorias WHERE nombre=?`,[req.body.categoria])

		await connection.query(`INSERT INTO productos (nombre,descripcion,precio,imagen,id_categoria,stock) VALUES(?,?,?,?,?,?)`,[req.body.nombre,req.body.descripcion,req.body.precio,imagen,id_categoria[0].id_categoria,req.body.stock])
		res.status(201).json({message:'producto creado correctamente'})
	} catch (error) {
		console.log(error)
		res.status(500).send(error)	
	}
})

//seccion para crear ORDENES
app.post('/registrarOrden',async (req,res)=>{
	try {
		let total=0
		req.body.forEach((item)=>{
			total=total + item.price
		})
		const [id_mp] = await connection.query(`SELECT id_mp FROM metodos_de_pago WHERE nombre=?`,[req.body[0].metodoPago])
		await connection.query(`INSERT INTO ordenes (fecha_orden,total_orden,nro_mesa,id_mp,recibido) VALUES (?,?,?,?,?)`,[req.body[0].fecha.split('T')[0],total,req.body[0].mesa,id_mp[0].id_mp,true])
		const [id_orden] = await connection.query(`SELECT MAX(id_orden) AS id_orden FROM ordenes`)
		for(let i=0;i<req.body.length;i++){
			const {nombre,descripcion} = req.body[i]
			console.log(req.body[i])
			try {
				const [id_prod] = await connection.query(`SELECT id_prod FROM productos WHERE nombre=? and descripcion = ?`,[nombre,descripcion])
				console.log(id_prod)
				await connection.query(`INSERT INTO productoXorden (nombre_producto,descripcion_producto,id_producto,id_orden,cantidad) VALUES (?,?,?,?,?)`,[nombre,descripcion,id_prod[0].id_prod,id_orden[0].id_orden,1])
				
			} catch (error) {
				console.log(error)
			}
			
		}
		res.status(201).json({message:'Orden registrada correctamente'})
	} catch (error) {
		console.log(error)
	}

})
//seccion para editar orden normal
app.patch('/atenderOrden',async (req,res)=>{
	const {id_orden} = req.body
	console.log(id_orden)

	try {
		await connection.query(`UPDATE ordenes SET recibido=0 WHERE id_orden=?`,[id_orden])
		res.status(200).json('Orden atendida!')
	} catch (error) {
		res.status(500).json(error)
	}
})
app.patch('/atenderOrdenMixta',async (req,res)=>{
	const {id_orden} = req.body
	console.log(id_orden)

	try {
		await connection.query(`UPDATE ordenes_mixtas SET recibido=0 WHERE id_orden=?`,[id_orden])
		res.status(200).json('Orden Mixta atendida!')
	} catch (error) {
		res.status(500).json(error)
	}
})
//registro de orden mixta
app.post('/registrarOrdenMixta',async (req,res)=>{
	try {
		await connection.query(`INSERT INTO ordenes_mixtas (fecha_orden,pagadoMP,pagadoEfectivo,nro_mesa,recibido) VALUES (?,?,?,?,?)`,[req.body[0].fecha.split('T')[0],req.body[0].pagadoMP,req.body[0].pagadoEfectivo,req.body[0].mesa,true])
		const [id_orden] = await connection.query(`SELECT MAX(id_orden) AS id_orden FROM ordenes_mixtas`)
		for(let i=0;i<req.body.length;i++){
			const {nombre,descripcion} = req.body[i]
			try {
				const [id_prod] = await connection.query(`SELECT id_prod FROM productos WHERE nombre=? and descripcion = ?`,[nombre,descripcion])
				await connection.query(`INSERT INTO productoXordenesMixtas (nombre_producto,descripcion_producto,id_producto,id_ordenMixta,cantidad) VALUES (?,?,?,?,?)`,[nombre,descripcion,id_prod[0].id_prod,id_orden[0].id_orden,1])
				
			} catch (error) {
				console.log(error)
				res.status(500).send(error)
			}
			
		}
		res.status(201).json({message:'Orden registrada correctamente'})
	} catch (error) {
		console.log(error)
		res.status(500).send(error)
	}

})
//seccion para traer productos:
app.get('/traerProductos',async (req,res)=>{
	try {
		const [data] = await connection.query(`SELECT nombre,descripcion,precio,imagen FROM productos;`)
		for(let i=0;i<data.length;i++){
			data[i].imagen = data[i].imagen.toString('base64')
		}
		res.status(200).json(data)
	} catch (error) {
		res.status(500).json(error)
	}
})
server.listen(PORT, () => {
	console.log(`running on ${PORT}`);
});

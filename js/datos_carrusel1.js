const datos_carrusel1 = [
    {
        imagen: "img/image1.jpg",
        tema: "	La Boda",
        cantante: "Aventura",
    },
    {
        imagen: "img/image2.jpg",
        tema: "Angelito",
        cantante: "Aventura",
    },
    {
        imagen: "img/image3.jpg",
        tema: "Hoja en Blanco",
        cantante: "Monchy y Alexandra",
    },
    {
        imagen: "img/image1.jpg",
        tema: "Mis Ojos Lloran Por Ti",
        cantante: "Big Boy",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 1",
        cantante: "anonimo 1",
    },
    {
        imagen: "img/image2.jpg",
        tema: "boy 2",
        cantante: "anonimo 2",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image3.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
    {
        imagen: "img/image1.jpg",
        tema: "boy 3",
        cantante: "anonimo 3",
    },
];

const insertar_carrusel1 = document.getElementById("carrusel1");
for (let index of datos_carrusel1 ) {
    insertar_carrusel1.innerHTML += `

    <div class="carousel-item">
        <img src="${index.imagen}" alt="Imagen 1" loading="lazy">
        <p>${index.tema}</p>
        <p>${index.cantante}</p>
    </div>
`;
}

// Package icone dessine l'icône de sonar.exe et l'écrit dans les deux formats dont on a besoin, avec la seule
// bibliothèque standard :
//   - sonar.ico : le fichier d'icône (installeur Inno Setup, SetupIconFile) ;
//   - rsrc_windows_amd64.syso : les ressources Windows (RT_ICON + RT_GROUP_ICON) que « go build » joint à l'exe
//     pour Windows/amd64 (fichier ignoré pour les autres systèmes).
//
// Les deux fichiers sont commités ; « go generate » (voir main.go) les refait, et le test vérifie qu'ils sont à jour.
// Le dessin : un anneau (le cercle d'usage) avec un arc de progression, sur un carré arrondi sombre.
package icone

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
)

// Tailles proposées à Windows : 16 à 48 pour les listes et le menu Démarrer, 256 pour les grandes icônes.
var Tailles = []int{16, 20, 24, 32, 40, 48, 64, 256}

var (
	fond  = color.NRGBA{0x1E, 0x29, 0x3B, 0xFF} // ardoise sombre
	piste = color.NRGBA{0x47, 0x55, 0x69, 0xFF} // anneau complet, discret
	arc   = color.NRGBA{0xFB, 0xBF, 0x24, 0xFF} // progression, ambre
)

// Proportions, en fraction du côté.
const (
	rayonCoin   = 0.22
	rayonAnneau = 0.30
	epaisseur   = 0.12
	finArc      = 0.75 // trois quarts du tour, depuis midi, dans le sens des aiguilles d'une montre
	surEch      = 8    // sous-pixels par côté de pixel (anticrénelage)
)

// Dessiner : l'icône à la taille donnée, couleurs sans prémultiplication.
func Dessiner(taille int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, taille, taille))
	for y := 0; y < taille; y++ {
		for x := 0; x < taille; x++ {
			var r, g, b, a float64
			for sy := 0; sy < surEch; sy++ {
				for sx := 0; sx < surEch; sx++ {
					u := (float64(x) + (float64(sx)+0.5)/surEch) / float64(taille)
					v := (float64(y) + (float64(sy)+0.5)/surEch) / float64(taille)
					if c, ok := couleur(u, v); ok {
						r += float64(c.R)
						g += float64(c.G)
						b += float64(c.B)
						a++
					}
				}
			}
			if a == 0 {
				continue
			}
			n := float64(surEch * surEch)
			img.SetNRGBA(x, y, color.NRGBA{
				R: uint8(math.Round(r / a)), G: uint8(math.Round(g / a)), B: uint8(math.Round(b / a)),
				A: uint8(math.Round(a / n * 255)),
			})
		}
	}
	return img
}

// couleur du point (u, v) du carré unité, ou false hors de l'icône.
func couleur(u, v float64) (color.NRGBA, bool) {
	if !dansCarreArrondi(u, v) {
		return color.NRGBA{}, false
	}
	// Bouts arrondis de l'arc (midi et neuf heures), par-dessus la piste.
	for _, t := range []float64{0, finArc} {
		cx := 0.5 + rayonAnneau*math.Sin(2*math.Pi*t)
		cy := 0.5 - rayonAnneau*math.Cos(2*math.Pi*t)
		if math.Hypot(u-cx, v-cy) <= epaisseur/2 {
			return arc, true
		}
	}
	dx, dy := u-0.5, v-0.5
	if math.Abs(math.Hypot(dx, dy)-rayonAnneau) <= epaisseur/2 {
		// Angle depuis midi, dans le sens des aiguilles d'une montre, en tours (0 à 1).
		t := math.Atan2(dx, -dy) / (2 * math.Pi)
		if t < 0 {
			t++
		}
		if t <= finArc {
			return arc, true
		}
		return piste, true
	}
	return fond, true
}

func dansCarreArrondi(u, v float64) bool {
	cx := math.Max(rayonCoin, math.Min(1-rayonCoin, u))
	cy := math.Max(rayonCoin, math.Min(1-rayonCoin, v))
	return math.Hypot(u-cx, v-cy) <= rayonCoin
}

// image d'une taille, au format attendu dans un .ico comme dans une ressource RT_ICON : PNG pour 256, bitmap
// (DIB 32 bits, avec son masque) en dessous, que toutes les versions de Windows lisent.
func image1(taille int) []byte {
	img := Dessiner(taille)
	if taille >= 256 {
		var b bytes.Buffer
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		if err := enc.Encode(&b, img); err != nil {
			panic(err)
		}
		return b.Bytes()
	}
	var b bytes.Buffer
	ecrire := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	ligneMasque := ((taille + 31) / 32) * 4
	ecrire(uint32(40))                                   // biSize
	ecrire(int32(taille))                                // biWidth
	ecrire(int32(2 * taille))                            // biHeight : image + masque
	ecrire(uint16(1))                                    // biPlanes
	ecrire(uint16(32))                                   // biBitCount
	ecrire(uint32(0))                                    // biCompression : BI_RGB
	ecrire(uint32(taille*taille*4 + ligneMasque*taille)) // biSizeImage
	ecrire([4]uint32{})                                  // résolution, couleurs
	for y := taille - 1; y >= 0; y-- {                   // lignes de bas en haut
		for x := 0; x < taille; x++ {
			c := img.NRGBAAt(x, y)
			b.Write([]byte{c.B, c.G, c.R, c.A})
		}
	}
	b.Write(make([]byte, ligneMasque*taille)) // masque ET : tout à zéro, la transparence vient de l'alpha
	return b.Bytes()
}

func images() [][]byte {
	r := make([][]byte, len(Tailles))
	for i, t := range Tailles {
		r[i] = image1(t)
	}
	return r
}

func octetTaille(t int) uint8 {
	if t >= 256 {
		return 0 // 0 veut dire 256
	}
	return uint8(t)
}

// Ico : le fichier sonar.ico.
func Ico() []byte {
	imgs := images()
	var b bytes.Buffer
	ecrire := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	ecrire([3]uint16{0, 1, uint16(len(imgs))}) // ICONDIR : réservé, type icône, nombre
	pos := 6 + 16*len(imgs)
	for i, t := range Tailles {
		b.Write([]byte{octetTaille(t), octetTaille(t), 0, 0})
		ecrire([2]uint16{1, 32})                             // plans, bits par pixel
		ecrire([2]uint32{uint32(len(imgs[i])), uint32(pos)}) // taille, position
		pos += len(imgs[i])
	}
	for _, im := range imgs {
		b.Write(im)
	}
	return b.Bytes()
}

// groupe : la ressource RT_GROUP_ICON, qui liste les RT_ICON 1..n.
func groupe(imgs [][]byte) []byte {
	var b bytes.Buffer
	ecrire := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	ecrire([3]uint16{0, 1, uint16(len(imgs))})
	for i, t := range Tailles {
		b.Write([]byte{octetTaille(t), octetTaille(t), 0, 0})
		ecrire([2]uint16{1, 32})
		ecrire(uint32(len(imgs[i])))
		ecrire(uint16(i + 1))
	}
	return b.Bytes()
}

// Constantes du format PE/COFF.
const (
	rtIcon       = 3
	rtGroupIcon  = 14
	langue       = 0x0409 // anglais (États-Unis), la langue neutre usuelle des ressources
	machineAMD64 = 0x8664
	relAddr32NB  = 0x0003 // IMAGE_REL_AMD64_ADDR32NB : adresse relative à l'image
	sectionRsrc  = 0x40000040
	sousDossier  = 0x80000000
)

// Syso : un objet COFF d'une section .rsrc, que l'éditeur de liens de Go place dans les ressources de l'exe.
// Arborescence : type (RT_ICON, RT_GROUP_ICON) > identifiant > langue > données. Les adresses des données sont des
// adresses relatives à l'image, que l'éditeur de liens corrige (une relocation par donnée).
func Syso() []byte {
	imgs := images()
	type ressource struct {
		id   uint32
		data []byte
	}
	types := []struct {
		id    uint32
		elems []ressource
	}{{id: rtIcon}, {id: rtGroupIcon, elems: []ressource{{1, groupe(imgs)}}}}
	for i, im := range imgs {
		types[0].elems = append(types[0].elems, ressource{uint32(i + 1), im})
	}

	// Positions : dossier racine, dossiers des types, dossiers des langues, entrées de données, puis données.
	dossier := func(n int) int { return 16 + 8*n }
	pos := dossier(len(types))
	posType := make([]int, len(types))
	for i, t := range types {
		posType[i] = pos
		pos += dossier(len(t.elems))
	}
	type feuille struct{ langue, entree, donnee int }
	feuilles := make([][]feuille, len(types))
	for i, t := range types {
		feuilles[i] = make([]feuille, len(t.elems))
		for j := range t.elems {
			feuilles[i][j].langue = pos
			pos += dossier(1)
		}
	}
	for i, t := range types {
		for j := range t.elems {
			feuilles[i][j].entree = pos
			pos += 16
		}
	}
	for i, t := range types {
		for j, e := range t.elems {
			pos = (pos + 7) &^ 7
			feuilles[i][j].donnee = pos
			pos += len(e.data)
		}
	}
	taille := (pos + 7) &^ 7

	sec := make([]byte, taille)
	le := binary.LittleEndian
	ecrireDossier := func(at int, entrees [][2]uint32) {
		le.PutUint16(sec[at+14:], uint16(len(entrees))) // entrées par identifiant (aucune par nom)
		for k, e := range entrees {
			le.PutUint32(sec[at+16+8*k:], e[0])
			le.PutUint32(sec[at+16+8*k+4:], e[1])
		}
	}
	var racine [][2]uint32
	for i, t := range types {
		racine = append(racine, [2]uint32{t.id, sousDossier | uint32(posType[i])})
		var ids [][2]uint32
		for j, e := range t.elems {
			ids = append(ids, [2]uint32{e.id, sousDossier | uint32(feuilles[i][j].langue)})
			ecrireDossier(feuilles[i][j].langue, [][2]uint32{{langue, uint32(feuilles[i][j].entree)}})
			at := feuilles[i][j].entree
			le.PutUint32(sec[at:], uint32(feuilles[i][j].donnee)) // corrigée par la relocation
			le.PutUint32(sec[at+4:], uint32(len(e.data)))
			copy(sec[feuilles[i][j].donnee:], e.data)
		}
		ecrireDossier(posType[i], ids)
	}
	ecrireDossier(0, racine)

	var relocs []uint32
	for i := range types {
		for j := range types[i].elems {
			relocs = append(relocs, uint32(feuilles[i][j].entree))
		}
	}

	const entete, enteteSection = 20, 40
	posDonnees := entete + enteteSection
	posRelocs := posDonnees + taille
	posSymboles := posRelocs + 10*len(relocs)

	var b bytes.Buffer
	ecrire := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	// En-tête COFF.
	ecrire(uint16(machineAMD64))
	ecrire(uint16(1))           // une section
	ecrire(uint32(0))           // date : 0, pour un fichier reproductible
	ecrire(uint32(posSymboles)) // table des symboles
	ecrire(uint32(1))           // un symbole
	ecrire(uint16(0))           // pas d'en-tête optionnel
	ecrire(uint16(0))           // caractéristiques
	// En-tête de la section .rsrc.
	b.WriteString(".rsrc\x00\x00\x00")
	ecrire([2]uint32{0, 0}) // taille et adresse virtuelles : fixées par l'éditeur de liens
	ecrire(uint32(taille))
	ecrire(uint32(posDonnees))
	ecrire(uint32(posRelocs))
	ecrire(uint32(0)) // pas de numéros de ligne
	ecrire(uint16(len(relocs)))
	ecrire(uint16(0))
	ecrire(uint32(sectionRsrc)) // données initialisées, lecture
	b.Write(sec)
	for _, r := range relocs {
		ecrire(r)         // position du champ à corriger
		ecrire(uint32(0)) // symbole 0 : la section
		ecrire(uint16(relAddr32NB))
	}
	// Symbole 0 : la section .rsrc elle-même (statique).
	b.WriteString(".rsrc\x00\x00\x00")
	ecrire(uint32(0)) // valeur
	ecrire(uint16(1)) // section 1
	ecrire(uint16(0)) // type
	b.Write([]byte{3, 0})
	ecrire(uint32(4)) // table des chaînes vide (sa seule longueur)
	return b.Bytes()
}

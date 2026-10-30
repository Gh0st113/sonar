package icone

import (
	"bytes"
	"debug/pe"
	"encoding/binary"
	"image/png"
	"os"
	"testing"
)

// Les fichiers commités sont ceux que produit le code (sinon : « go generate » dans windows/).
func TestFichiersAJour(t *testing.T) {
	for nom, attendu := range map[string][]byte{"../sonar.ico": Ico(), "../rsrc_windows_amd64.syso": Syso()} {
		lu, err := os.ReadFile(nom)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(lu, attendu) {
			t.Errorf("%s n'est pas à jour : lancer « go generate » dans extension/", nom)
		}
	}
}

func TestIco(t *testing.T) {
	ico := Ico()
	le := binary.LittleEndian
	if le.Uint16(ico[2:]) != 1 || int(le.Uint16(ico[4:])) != len(Tailles) {
		t.Fatal("ICONDIR")
	}
	for i, taille := range Tailles {
		e := ico[6+16*i:]
		n, pos := le.Uint32(e[8:]), le.Uint32(e[12:])
		im := ico[pos : pos+n]
		if taille >= 256 {
			img, err := png.Decode(bytes.NewReader(im))
			if err != nil || img.Bounds().Dx() != 256 {
				t.Fatalf("PNG 256 : %v", err)
			}
			continue
		}
		if int(e[0]) != taille || le.Uint32(im) != 40 || int(int32(le.Uint32(im[8:]))) != 2*taille {
			t.Fatalf("bitmap %d", taille)
		}
	}
	// Coins transparents, centre opaque (fond), haut de l'anneau en ambre.
	img := Dessiner(64)
	if img.NRGBAAt(0, 0).A != 0 || img.NRGBAAt(32, 32).A != 255 || img.NRGBAAt(32, 13) != arc {
		t.Fatalf("dessin : coin %v centre %v haut %v", img.NRGBAAt(0, 0), img.NRGBAAt(32, 32), img.NRGBAAt(32, 13))
	}
}

// L'objet COFF se relit avec debug/pe : une section .rsrc, une relocation par donnée, un symbole.
func TestSyso(t *testing.T) {
	f, err := pe.NewFile(bytes.NewReader(Syso()))
	if err != nil {
		t.Fatal(err)
	}
	if f.Machine != pe.IMAGE_FILE_MACHINE_AMD64 || len(f.Sections) != 1 || f.Sections[0].Name != ".rsrc" {
		t.Fatalf("en-tête : %+v", f.FileHeader)
	}
	s := f.Sections[0]
	if int(s.NumberOfRelocations) != len(Tailles)+1 || len(f.Symbols) != 1 || f.Symbols[0].Name != ".rsrc" {
		t.Fatalf("relocations %d, symboles %d", s.NumberOfRelocations, len(f.Symbols))
	}
	data, _ := s.Data()
	le := binary.LittleEndian
	// Racine : deux types, RT_ICON puis RT_GROUP_ICON (ordre croissant exigé par Windows).
	if le.Uint16(data[14:]) != 2 || le.Uint32(data[16:]) != rtIcon || le.Uint32(data[24:]) != rtGroupIcon {
		t.Fatal("racine")
	}
	// Suivre RT_GROUP_ICON jusqu'à ses données : le groupe liste toutes les tailles.
	d := le.Uint32(data[28:]) &^ sousDossier
	l := le.Uint32(data[d+20:]) &^ sousDossier
	entree := le.Uint32(data[l+20:])
	pos, n := le.Uint32(data[entree:]), le.Uint32(data[entree+4:])
	g := data[pos : pos+n]
	if int(le.Uint16(g[4:])) != len(Tailles) || le.Uint16(g[6+14*(len(Tailles)-1)+12:]) != uint16(len(Tailles)) {
		t.Fatal("groupe d'icônes")
	}
}

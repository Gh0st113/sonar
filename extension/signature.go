// Signature des mises à jour (ed25519, bibliothèque standard seule).
//
// Une mise à jour n'est installée que si sa signature vérifie avec la clé publique embarquée (cle-publique.txt).
// La clé privée ne va jamais sur GitHub : elle reste chez l'utilisateur, chiffrée par une phrase de passe
// (PBKDF2-SHA256 puis AES-256-GCM). Un compte GitHub compromis peut publier un exe, pas le faire accepter.
//
// Le message signé lie la version au contenu : « sonar-cercle-maj-v1\n<version>\n<sha256 hex de l'exe>\n ». Une
// vieille version signée ne peut donc pas être resservie comme nouvelle (la version doit monter, voir maj.go).
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const (
	contexteSignature = "sonar-cercle-maj-v1"
	iterations        = 600_000
)

func messageSigne(version string, contenu []byte) []byte {
	h := sha256.Sum256(contenu)
	return []byte(fmt.Sprintf("%s\n%s\n%s\n", contexteSignature, version, hex.EncodeToString(h[:])))
}

// clePublique : la clé embarquée ; nil si aucune (mises à jour désactivées).
func clePublique() (ed25519.PublicKey, error) {
	t := strings.TrimSpace(clePubliqueTexte)
	if t == "" {
		return nil, nil
	}
	b, err := base64.StdEncoding.DecodeString(t)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return nil, errors.New("cle-publique.txt illisible")
	}
	return ed25519.PublicKey(b), nil
}

// Fichier de signature (.sig) : la version, puis la signature en base64, une par ligne.
func signer(prive ed25519.PrivateKey, version string, contenu []byte) string {
	sig := ed25519.Sign(prive, messageSigne(version, contenu))
	return version + "\n" + base64.StdEncoding.EncodeToString(sig) + "\n"
}

// verifier : la signature vaut pour ce contenu et cette version, avec cette clé. Renvoie la version signée.
func verifier(pub ed25519.PublicKey, sigFichier string, contenu []byte) (string, error) {
	lignes := strings.Split(strings.TrimSpace(sigFichier), "\n")
	if len(lignes) != 2 {
		return "", errors.New("fichier de signature mal formé")
	}
	v := strings.TrimSpace(lignes[0])
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(lignes[1]))
	if err != nil || len(sig) != ed25519.SignatureSize {
		return "", errors.New("signature mal formée")
	}
	if !ed25519.Verify(pub, messageSigne(v, contenu), sig) {
		return "", errors.New("signature invalide")
	}
	return v, nil
}

// Fichier de clé privée chiffrée.
type clePrivee struct {
	Format     string `json:"format"`
	Iterations int    `json:"iterations"`
	Sel        string `json:"sel"`
	Nonce      string `json:"nonce"`
	Chiffre    string `json:"chiffre"`
	Publique   string `json:"publique"`
}

func aead(phrase string, sel []byte, iter int) (cipher.AEAD, error) {
	k, err := pbkdf2.Key(sha256.New, phrase, sel, iter, 32)
	if err != nil {
		return nil, err
	}
	bloc, err := aes.NewCipher(k)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(bloc)
}

// nouvelleCle : une paire ed25519 ; renvoie le fichier de clé privée chiffrée (JSON) et la clé publique en base64.
func nouvelleCle(phrase string) ([]byte, string, error) {
	if len(phrase) < 12 {
		return nil, "", errors.New("phrase de passe trop courte (12 caractères au moins)")
	}
	// Caractères ASCII imprimables seulement : une console Windows code « é » ou « € » autrement que le secret
	// CERCLE_PHRASE de GitHub (UTF-8), et la clé ne s'ouvrirait plus au moment de publier.
	for _, r := range phrase {
		if r < 0x20 || r > 0x7E {
			return nil, "", errors.New("phrase de passe : lettres sans accent, chiffres, espaces et signes simples seulement (pas de é, €…)")
		}
	}
	pub, prive, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, "", err
	}
	sel := make([]byte, 16)
	nonce := make([]byte, 12)
	if _, err := rand.Read(sel); err != nil {
		return nil, "", err
	}
	if _, err := rand.Read(nonce); err != nil {
		return nil, "", err
	}
	a, err := aead(phrase, sel, iterations)
	if err != nil {
		return nil, "", err
	}
	pubTexte := base64.StdEncoding.EncodeToString(pub)
	f := clePrivee{
		Format: "sonar-cercle-cle-v1", Iterations: iterations,
		Sel: base64.StdEncoding.EncodeToString(sel), Nonce: base64.StdEncoding.EncodeToString(nonce),
		Chiffre:  base64.StdEncoding.EncodeToString(a.Seal(nil, nonce, prive.Seed(), []byte(pubTexte))),
		Publique: pubTexte,
	}
	b, err := json.MarshalIndent(f, "", "  ")
	return b, pubTexte, err
}

// ouvrirCle : la clé privée, déchiffrée par la phrase de passe.
func ouvrirCle(fichier []byte, phrase string) (ed25519.PrivateKey, error) {
	var f clePrivee
	if json.Unmarshal(fichier, &f) != nil || f.Format != "sonar-cercle-cle-v1" || f.Iterations < 100_000 || f.Iterations > 10_000_000 {
		return nil, errors.New("fichier de clé illisible")
	}
	sel, e1 := base64.StdEncoding.DecodeString(f.Sel)
	nonce, e2 := base64.StdEncoding.DecodeString(f.Nonce)
	chiffre, e3 := base64.StdEncoding.DecodeString(f.Chiffre)
	if e1 != nil || e2 != nil || e3 != nil {
		return nil, errors.New("fichier de clé illisible")
	}
	a, err := aead(phrase, sel, f.Iterations)
	if err != nil {
		return nil, err
	}
	graine, err := a.Open(nil, nonce, chiffre, []byte(f.Publique))
	if err != nil || len(graine) != ed25519.SeedSize {
		return nil, errors.New("phrase de passe incorrecte")
	}
	return ed25519.NewKeyFromSeed(graine), nil
}

package infrastructure

// What the Amharic voice is given: only Amharic words. Interface text also has digits ("ጥያቄ 1
// ከ 11"), Latin punctuation ("?", "."), symbols ("(", "«", "%", "-"), a colon at the end
// ("ተመርጧል፦") and a few English words ("Enter", "SMS"); the voice reads those badly, mostly at
// the end of a part. speakableAmharic turns a text into plain Amharic before it is sent (and
// cached: two spellings of the same words share one clip):
//
//   - numbers become Amharic words ("11" → "አስራ አንድ", "150%" → "መቶ ሃምሳ በመቶ");
//   - known English words become Amharic ("Enter" → "ኢንተር"), acronyms are spelled with Amharic
//     letter names ("SMS" → "ኤስ ኤም ኤስ"), any other Latin text is left out;
//   - a sentence break inside the text becomes "።" and a pause "፣"; every other mark (brackets,
//     quotes, dashes, colons, "፦") is left out, and nothing is kept at the start or the end.
//
// It returns "" when nothing Amharic is left (the part is not sent at all).

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// isEthiopic: a letter of the Ethiopic script (Ethiopic, Ethiopic Supplement and Extended,
// Extended-A), not its punctuation (U+1360–U+1368) or its own numerals (U+1369–U+137C).
func isEthiopic(r rune) bool {
	switch {
	case r >= 0x1200 && r <= 0x135F:
		return true
	case r >= 0x1380 && r <= 0x139F, r >= 0x2D80 && r <= 0x2DDF, r >= 0xAB00 && r <= 0xAB2F:
		return true
	}
	return false
}

// hasEthiopic: the text has at least one Amharic letter.
func hasEthiopic(s string) bool {
	for _, r := range s {
		if isEthiopic(r) {
			return true
		}
	}
	return false
}

// English words that appear in the Amharic interface text, as Amharic speakers say them.
var amharicForLatin = map[string]string{
	"enter":    "ኢንተር",
	"tab":      "ታብ",
	"space":    "ስፔስ",
	"telegram": "ቴሌግራም",
	"english":  "እንግሊዝኛ",
	"chrome":   "ክሮም",
	"edge":     "ኤጅ",
	"fayda":    "ፋይዳ",
	"email":    "ኢሜይል",
	"online":   "ኦንላይን",
}

// Latin letter names in Amharic, to spell acronyms ("SMS" → "ኤስ ኤም ኤስ").
var amharicLetterNames = map[rune]string{
	'A': "ኤ", 'B': "ቢ", 'C': "ሲ", 'D': "ዲ", 'E': "ኢ", 'F': "ኤፍ", 'G': "ጂ", 'H': "ኤች", 'I': "አይ",
	'J': "ጄ", 'K': "ኬ", 'L': "ኤል", 'M': "ኤም", 'N': "ኤን", 'O': "ኦ", 'P': "ፒ", 'Q': "ኪው", 'R': "አር",
	'S': "ኤስ", 'T': "ቲ", 'U': "ዩ", 'V': "ቪ", 'W': "ደብሊው", 'X': "ኤክስ", 'Y': "ዋይ", 'Z': "ዜድ",
}

var (
	latinWord   = regexp.MustCompile(`[A-Za-z]+`)
	numberToken = regexp.MustCompile(`[0-9]+(\s*%)?`)
	clockTime   = regexp.MustCompile(`\b([0-9]{1,2}):([0-9]{2})\b`) // "3:00", "11:30"
)

// quoteMark: a quote or bracket. It is left out without splitting the word around it
// ("«አዎ»ን" → "አዎን").
func quoteMark(r rune) bool {
	switch r {
	case '«', '»', '"', '\'', '“', '”', '‘', '’', '(', ')', '[', ']', '{', '}':
		return true
	}
	return false
}

// latinToAmharic: a known word in Amharic, an acronym (2–6 capitals) spelled, else nothing.
func latinToAmharic(word string) string {
	if am, ok := amharicForLatin[strings.ToLower(word)]; ok {
		return am
	}
	if n := len(word); n >= 1 && n <= 6 && strings.ToUpper(word) == word {
		names := make([]string, 0, n)
		for _, r := range word {
			names = append(names, amharicLetterNames[r])
		}
		return strings.Join(names, " ")
	}
	return ""
}

var (
	amOnes = []string{"", "አንድ", "ሁለት", "ሶስት", "አራት", "አምስት", "ስድስት", "ሰባት", "ስምንት", "ዘጠኝ"}
	amTens = []string{"", "አስር", "ሃያ", "ሰላሳ", "አርባ", "ሃምሳ", "ስልሳ", "ሰባ", "ሰማንያ", "ዘጠና"}
)

// amharicNumber: 0 to 999 999 in words ("2017" → "ሁለት ሺህ አስራ ሰባት"); larger numbers digit by
// digit.
func amharicNumber(digits string) string {
	n, err := strconv.Atoi(digits)
	if err != nil || n >= 1_000_000 {
		words := make([]string, 0, len(digits))
		for _, d := range digits {
			if d == '0' {
				words = append(words, "ዜሮ")
			} else {
				words = append(words, amOnes[d-'0'])
			}
		}
		return strings.Join(words, " ")
	}
	if n == 0 {
		return "ዜሮ"
	}
	var below1000 func(int) []string
	below1000 = func(v int) []string {
		var out []string
		if h := v / 100; h > 0 {
			if h == 1 {
				out = append(out, "መቶ")
			} else {
				out = append(out, amOnes[h], "መቶ")
			}
		}
		t, o := (v%100)/10, v%10
		switch {
		case t == 1 && o > 0:
			out = append(out, "አስራ", amOnes[o]) // 11–19: "አስራ አንድ"
		case t > 0:
			out = append(out, amTens[t])
			if o > 0 {
				out = append(out, amOnes[o])
			}
		case o > 0:
			out = append(out, amOnes[o])
		}
		return out
	}
	var words []string
	if th := n / 1000; th > 0 {
		words = append(words, below1000(th)...)
		words = append(words, "ሺህ")
	}
	words = append(words, below1000(n%1000)...)
	return strings.Join(words, " ")
}

// speakableAmharic turns interface text into plain Amharic for the voice ("" if none is left).
func speakableAmharic(text string) string {
	// 0. Clock times: "3:00" → "ሶስት ሰዓት", "11:30" → "አስራ አንድ ሰዓት ከ ሰላሳ ደቂቃ".
	text = clockTime.ReplaceAllStringFunc(text, func(tok string) string {
		m := clockTime.FindStringSubmatch(tok)
		words := amharicNumber(m[1]) + " ሰዓት"
		if strings.TrimLeft(m[2], "0") != "" {
			words += " ከ " + amharicNumber(strings.TrimLeft(m[2], "0")) + " ደቂቃ"
		}
		return " " + words + " "
	})
	// 1. Numbers (and percentages) as words.
	text = numberToken.ReplaceAllStringFunc(text, func(tok string) string {
		digits := strings.TrimRight(strings.TrimRight(tok, "%"), " \t")
		words := amharicNumber(digits)
		if strings.HasSuffix(tok, "%") {
			words += " በመቶ"
		}
		return " " + words + " "
	})
	// 2. Latin words: known ones and acronyms in Amharic letters, the rest left out.
	text = latinWord.ReplaceAllStringFunc(text, func(w string) string {
		return " " + latinToAmharic(w) + " "
	})

	// 3. Words and the breaks between them; everything else is left out.
	const (
		none = iota
		pause
		stop
	)
	var (
		out     strings.Builder
		pending = none // the strongest break seen since the last word
		word    strings.Builder
	)
	flush := func() {
		if word.Len() == 0 {
			return
		}
		if out.Len() > 0 {
			switch pending {
			case stop:
				out.WriteString("። ")
			case pause:
				out.WriteString("፣ ")
			default:
				out.WriteString(" ")
			}
		}
		out.WriteString(word.String())
		word.Reset()
		pending = none
	}
	for _, r := range text {
		switch {
		case isEthiopic(r):
			word.WriteRune(r)
		case r == '።' || r == '፧' || r == '፨' || r == '?' || r == '!' || r == '.' || r == '…':
			flush()
			pending = stop
		case r == '፣' || r == '፤' || r == '፥' || r == ',' || r == ';':
			flush()
			if pending < pause {
				pending = pause
			}
		case unicode.IsSpace(r):
			flush()
		case quoteMark(r):
			// left out, the word goes on
		default:
			// "፦", ":", brackets, quotes, dashes, slashes, "·", "@", Ethiopic numerals…
			flush()
		}
	}
	flush()
	return out.String()
}

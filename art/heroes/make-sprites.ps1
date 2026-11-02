# Builds the hero sprites (32x32 pixel art) from the text grids below.
# Each letter is one pixel; see $palette for colours, '.' is transparent.
# Run:  powershell -ExecutionPolicy Bypass -File art\heroes\make-sprites.ps1
# Writes hero_<class>.png (32x32) and preview.png (all four, 8x) next to this file.

Add-Type -AssemblyName System.Drawing

# Letter -> colour. Upper and lower case are different colours.
$palette = @(
  'k #1b1726'              # outline
  's #f2c4a0', 'S #c98f6e' # skin, skin shadow
  'h #6b3f22'              # brown hair
  'm #b8c2cc', 'M #7d8894', 'l #eef3f7' # steel, steel shadow, shine
  'r #b3262e', 'R #7a1820' # red cloth
  'g #e3b341'              # gold
  'b #6b4428', 'B #3e2918' # leather, dark leather
  'w #f2f0e8', 'W #b8b4a6' # white robe
  'o #d0662c', 'O #8e3c16' # ginger hair/beard
  'L #fff1a0'              # holy light
  'p #ee6fb3'              # pink hair
  'c #79e2ff', 'C #2f9fd6' # arcane cyan
  'v #4a62d8', 'V #2c3a8c' # blue robe
  'd #4a4f60', 'D #2a2d38' # dark hood
  'e #7d5b3d', 'E #5a412b' # leather tunic
  'u #a8323f'              # sash
)

# base: rows of 32 characters. baseY: where row 0 lands (feet end on row 30).
# overlays: extra pieces (weapons) drawn on top; x/y are in base-row coordinates.
$heroes = [ordered]@{
  warrior = @{
    baseY = 4
    base = @(
      '................................'
      '................................'
      '................................'
      '............kkkkkkkk............'
      '...........khhhhhhhhk...........'
      '..........khhhhhhhhhhk..........'
      '..........khhsssssshhk..........'
      '..........khsksssskshk..........'
      '..........khsssssssshk..........'
      '..........kSsssSSsssSk..........'
      '...........kSSssssSSk...........'
      '............kkSSSSkk............'
      '........kkkkkkkkkkkkkkkk........'
      '.......kllmmkmmmmmmkmmllk.......'
      '.......kmmmmkrrrrrrkmmmmk.......'
      '.......kMMMMkrrggrrkMMMMk.......'
      '........kkkkmrrggrrmkkkk........'
      '........kMMkmrrrrrrmkMMk........'
      '........kMMkmrrrrrrmkMMk........'
      '........ksskggggggggkssk........'
      '........kkkkrrRrrRrrkkkk........'
      '...........krrRrrRrrk...........'
      '...........kMMMkkMMMk...........'
      '...........kMMMkkMMMk...........'
      '...........kbbbkkbbbk...........'
      '..........kbbbbkkbbbbk..........'
      '..........kkkkkkkkkkkk..........'
    )
    overlays = @(
      @{ x = 2; y = 13; rows = @(          # kite shield
        '.kkkkk.'
        'kmmmmmk'
        'kmrgrmk'
        'kmgggmk'
        'kmrgrmk'
        'kmrrrmk'
        '.kmrmk.'
        '..kmk..'
        '...k...'
      ) }
      @{ x = 22; y = 3; rows = @(          # raised sword
        '..kk..'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        '.klMk.'
        'kggggk'
        '.kbbk.'
        '.kbbk.'
        '.kggk.'
        '..kk..'
      ) }
    )
  }

  priest = @{
    baseY = 11
    base = @(
      '...........kkkkkkkkkk...........'
      '..........kooooooooook..........'
      '.........kooossssssoook.........'
      '.........kossksssskssok.........'
      '.........kossssSSssssok.........'
      '........kOooooossoooooOk........'
      '........kOooooooooooooOk........'
      '.......kwkOooooooooooOkwk.......'
      '......kwwwkOooooooooOkwwwk......'
      '......kwwwwkOooooooOkwwwwk......'
      '......kwWwwwkOOooOOkwwwWwk......'
      '......kwWwwwwwkOOkwwwwwWwk......'
      '......kssWggggggggggggWssk......'
      '......kssWwwwwwggwwwwwWssk......'
      '.......kkWwwwwwggwwwwwWkk.......'
      '.........kWwwwwggwwwwWk.........'
      '.........kWWwwwggwwwWWk.........'
      '.........kggggggggggggk.........'
      '........kbbbbbk..kbbbbbk........'
      '........kkkkkkk..kkkkkkk........'
    )
    overlays = @(
      @{ x = 21; y = -2; rows = @(         # glowing mace
        '..LLL..'
        '.LkkkL.'
        'LkgggkL'
        'LkgLgkL'
        'LkgggkL'
        '.LkkkL.'
        '..kbk..'
        '..kbk..'
        '..kbk..'
        '..kbk..'
        '..kbk..'
        '..kbk..'
        '..kbk..'
        '..kbk..'
      ) }
    )
  }

  mage = @{
    baseY = 12
    base = @(
      '............kpk..kpk............'
      '...........kpppkkpppk...........'
      '..........kppppppppppk..........'
      '.........kppkkkkkkkkppk.........'
      '.........kpkcCkppkCckpk.........'
      '.........kpkkkkppkkkkpk.........'
      '.......kpkpsskssssksspkpk.......'
      '.......kpkpssssSSsssspkpk.......'
      '.......kpkksssssssssskkpk.......'
      '.......kpk.kksssssskk.kpk.......'
      '........k...kvvvvvvk...k........'
      '..........kvvvvvvvvvvk..........'
      '.........kskvvvvvvvvksk.........'
      '.........kkkvVvggvVvkkk.........'
      '..........kvVvvvvvvVvk..........'
      '..........kVVvvvvvvVVk..........'
      '..........kggggggggggk..........'
      '...........kbbk..kbbk...........'
      '...........kkkk..kkkk...........'
    )
    overlays = @(
      @{ x = 20; y = -9; rows = @(         # staff with arcane orb
        '.kkk.'
        'kcwck'
        'kCcck'
        '.kkk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.....'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kbk.'
        '.kkk.'
      ) }
    )
  }

  rogue = @{
    baseY = 12
    base = @(
      '............kkkkkkkk............'
      '...........kddddddddk...........'
      '..........kdddddddddDk..........'
      '.........kddDssssssDddk.........'
      '.........kdDskssssksDdk.........'
      '.........kdDDDDDDDDDDdk.........'
      '.........kdDDDDDDDDDDdk.........'
      '..........kdDDDDDDDDdk..........'
      '.......kddddkeeeeeekddddk.......'
      '.......kdDddkeuueeekddDdk.......'
      '.......kdDddkeeuueekddDdk.......'
      '.......kDDddkeeeuuekddDDk.......'
      '.......ksskBBBBggBBBBkssk.......'
      '.......kkkkeeeeeeeeeekkkk.......'
      '..........keeeeEEeeeek..........'
      '..........kDDDDkkDDDDk..........'
      '..........kDDDk..kDDDk..........'
      '.........kBBBBk..kBBBBk.........'
      '.........kkkkkk..kkkkkk.........'
    )
    overlays = @(
      @{ x = 7; y = 13; rows = @('kggk', 'klMk', 'klMk', 'klMk', 'klMk', '.kk.') }   # left dagger, reverse grip
      @{ x = 21; y = 13; rows = @('kggk', 'kMlk', 'kMlk', 'kMlk', 'kMlk', '.kk.') }  # right dagger
    )
  }
}

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$colors = New-Object 'System.Collections.Generic.Dictionary[string,System.Drawing.Color]'
foreach ($entry in $palette) {
  $letter, $hex = $entry -split ' '
  $colors[$letter] = [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Set-Pixels($bmp, $rows, $ox, $oy, $name) {
  for ($y = 0; $y -lt $rows.Count; $y++) {
    $row = $rows[$y]
    for ($x = 0; $x -lt $row.Length; $x++) {
      $ch = [string]$row[$x]
      if ($ch -eq '.') { continue }
      if (-not $colors.ContainsKey($ch)) { throw "$name row $y col ${x}: unknown colour '$ch'" }
      $px = $ox + $x; $py = $oy + $y
      if ($px -lt 0 -or $px -ge 32 -or $py -lt 0 -or $py -ge 32) { throw "$name pixel ($px,$py) is off the 32x32 canvas" }
      $bmp.SetPixel($px, $py, $colors[$ch])
    }
  }
}

$bitmaps = [ordered]@{}
foreach ($name in $heroes.Keys) {
  $hero = $heroes[$name]
  for ($i = 0; $i -lt $hero.base.Count; $i++) {
    if ($hero.base[$i].Length -ne 32) { throw "$name base row $i is $($hero.base[$i].Length) wide, expected 32" }
  }
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  Set-Pixels $bmp $hero.base 0 $hero.baseY "$name base"
  foreach ($o in $hero.overlays) { Set-Pixels $bmp $o.rows $o.x ($hero.baseY + $o.y) "$name overlay" }
  $bmp.Save((Join-Path $dir "hero_$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmaps[$name] = $bmp
}

# Preview sheet: each sprite at 8x on a light tile, with its name underneath.
$scale = 8; $tile = 32 * $scale; $pad = 16; $label = 28
$sheet = New-Object System.Drawing.Bitmap (($tile + $pad) * $bitmaps.Count + $pad), ($tile + $pad * 2 + $label)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#2b2f3a'))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$font = New-Object System.Drawing.Font 'Segoe UI', 14
$i = 0
foreach ($name in $bitmaps.Keys) {
  $x = $pad + $i * ($tile + $pad)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#8a93a6'))), $x, $pad, $tile, $tile)
  $g.DrawImage($bitmaps[$name], $x, $pad, $tile, $tile)
  $g.DrawString($name, $font, [System.Drawing.Brushes]::White, $x, $pad + $tile + 4)
  $i++
}
$sheet.Save((Join-Path $dir 'preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Wrote $($bitmaps.Count) sprites and preview.png to $dir"

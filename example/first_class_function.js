function displayCharacter(c) {
    console.log('The character is: ' + c);
}

function main() {
    var a = Array.from('');
    a.push(1);
    a.push(42);
    a.map(displayCharacter);
    console.log(a);
}

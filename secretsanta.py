#!/usr/bin/env python

from builtins import input
from builtins import map
import smtplib
import string
from getpass import getpass
from sys import argv
from random import randint, shuffle
from os.path import *

dir, script = split(argv[0])
usage_error = False

# pairing constraints (asymmetric relation)
# ex. not_allowed = { "Bob":"Mary", "Mary":"Bob" }
not_allowed = {}

#check args
if len(argv) < 2:
	# we at least need the input list
	usage_error = True
elif len(argv) < 3:
	# default to the current directory if none provided
	print("Warning: No output directory provided. Using \"{0}\"\n".format(dir))
	output_dir = dir
elif len(argv) == 3:
	# make sure the output directory exists
	if isdir(argv[2]):
		output_dir = realpath(argv[2])
	else:
		print("Error: Invalid output directory!")
		usage_error = True
else:
	# unexpected number of arguments
	print("Error: Invalid number of arguments!")
	usage_error = True

if not usage_error:
	# make sure the input file exists
	if not isfile(argv[1]):
		print("Error: Specified input file does not exist!")
		usage_error = True
	else:
		input_file = realpath(argv[1])

if usage_error:
	print("usage: python {0} input_list.txt output_dir".format(script))
	exit()

# if we got here, everything is niffy-spiffy so far
print("input_file = \"{0}\"\noutput_dir = \"{1}\"".format(input_file, output_dir))

lines =  list(map(string.strip, file(input_file, "r").readlines()))
names = []
for entry in lines:
	names.append(string.split(entry, "\t"))
print("\nInput list:")
for entry in names:
	print("\t{0} ({1})".format(entry[0], entry[1]))

loop_guard = 0
valid_order = False

while loop_guard < 10 and not valid_order:
	sorted_names = names[:] # make a copy in case we need the originial list later
	shuffle(sorted_names)
	
	print("\nList shuffled. Checking for valid ordering:", end=' ')
	
	first = current = sorted_names.pop()
	pairs = []
	valid_order = True
	while sorted_names:
		next = sorted_names.pop()
		
		if current[0] in not_allowed:
			if not_allowed[current[0]] == next[0]:
				print("MATCH NOT ALLOWED: {0} => {1}".format(current[0], next[0]))
				valid_order = False
				break
		pairs.append((current, next))
		current = next

	if valid_order:
		if current[0] in not_allowed:
			if not_allowed[current[0]] == first[0]:
				print("MATCH NOT ALLOWED: {0} => {1}".format(current[0], first[0]))
				valid_order = False
		pairs.append((current, first))
	
	loop_guard += 1
	if valid_order:
		print("VALID ORDER!")

if not valid_order:
	print("\nERROR: The list was shuffled {0} times without finding a valid ordering.\nPlease double-check that a valid ordering is possible given the following constraints:".format(loop_guard))
	for p1 in not_allowed:
		print("\t{0} => {1} NOT ALLOWED".format(p1, not_allowed[p1]))
	exit()

if input("\nDisplay matches (Y/N)? ").lower() == "y":
	for p1, p2 in pairs:
		print("\t{0} => {1} ".format(p1[0], p2[0]))

if input("\nWrite matches to disk (will overwrite existing files) (Y/N)? ").lower() == "y":
	for p1, p2 in pairs:
		out = file(join(output_dir, p1[0] + ".txt"), "w")
		out.write("{0} is buying for {1}".format(p1[0], p2[0]))
		out.close()

sendmail = input("\nSend emails (Y/N)?: ")
if sendmail.lower() == "y":
	debug = input("Debug mode (doesn't actually send) (Y/N)?: ")
	organizer_name = input("Your name (the organizer): ")
	from_address = input("From Address: ")

	smtp_server = input("SMTP Server: ")
	username = input("SMTP Username: ")
	password = getpass()

	s = smtplib.SMTP(smtp_server)
	#s.set_debuglevel(1)
	s.ehlo()
	s.starttls()
	s.ehlo()
	s.login(username, password)

	for to, match in pairs:
		to_name, to_address = to
		match_name, match_address = match
	
		subject = "{0}{1} Secret Santa Assignment...".format(
			to_name,
			"'" if to_name.endswith("s") else "'s"
		)
	
		headers = "From: {0}\r\nTo: {1}\r\nSubject: {2}\r\n\r\n".format(from_address, to_address, subject)
		message = headers + "Hey {0},\n\nYour Secret Santa is: {1}!\n\nShhh...don't tell anyone! ;)\n\n-Santa's little helper\n\nP.S. Please don't reply to this email, otherwise you'll spill the beans and {2} will know who you're buying for (they sent you this email via a dorky, overly-complicated, automated secret santa script).\n\nOh, and if you should happen to lose this email or forget who your secret santa is you can email {2} and they can send you a file with your match without them actually having to know who you're buying for. YAY CHRISTMAS!".format(to_name, match_name, organizer_name)
	
		if debug.lower() == "y":
			print("\n" + message)
	
		if debug.lower() == "n":
			s.sendmail(from_address, to_address, message)

	s.close()
